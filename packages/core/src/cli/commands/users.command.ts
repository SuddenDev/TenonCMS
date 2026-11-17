import * as p from "@clack/prompts";
import { styleText } from "node:util";
import { translate } from "../../admin/browser/text.ts";
import { BUILT_IN_ROLES, type Role } from "../../users/roles.ts";
import type { UserSummary } from "../../users/types.ts";
import { loadConfig, type LocalCms, remoteClient, type TargetFlags } from "../target.ts";
import { Cancelled, answer, canAsk } from "../ui.ts";

export type UsersFlags = TargetFlags & {
  role?: string;
  password?: boolean;
  yes?: boolean;
};

const USAGE = "Usage: tenon users create|list|recover|deactivate|reactivate|remove [email]";

/** `tenon users create|list|recover|deactivate|reactivate|remove`. */
export async function usersCommand(
  action: string | undefined,
  email: string | undefined,
  flags: UsersFlags,
) {
  if (action === "create") return createCommand(email, flags);
  if (action === "recover") return recoverCommand(email, flags);
  if (action === "list") return listCommand(flags);
  if (action === "deactivate" || action === "reactivate" || action === "remove")
    return changeCommand(action, email, flags);
  throw new Error(USAGE);
}

async function listCommand(flags: UsersFlags) {
  const cms = await loadConfig(localOnly("list", flags));
  console.log(formatUsers(await cms.users.list(), { color: process.stdout.hasColors?.() }));
}

const CHANGES: Record<
  "deactivate" | "reactivate" | "remove",
  { question?: (email: string) => string; initialValue?: boolean; done: (email: string) => string }
> = {
  deactivate: {
    question: (email) => `Deactivate ${email}? It ends their sessions and blocks sign-in.`,
    initialValue: true,
    done: (email) => `Deactivated ${email}`,
  },
  reactivate: { done: (email) => `Reactivated ${email}` },
  remove: {
    question: (email) =>
      `Remove ${email}? It deletes the user and cannot be undone. Their content stays.`,
    initialValue: false,
    done: (email) => `Removed ${email}`,
  },
};

/** Deactivates, reactivates or removes a user. Deactivate and remove confirm first, unless `--yes`. Local only. */
async function changeCommand(
  action: keyof typeof CHANGES,
  email: string | undefined,
  flags: UsersFlags,
) {
  if (!email) throw new Error(`Usage: tenon users ${action} <email>`);
  const cms = await loadConfig(localOnly(action, flags));
  const change = CHANGES[action];

  if (change.question && !flags.yes) {
    if (!canAsk(flags)) throw new Error(`Pass --yes to ${action} ${email} without questions.`);
    const go = await answer(
      p.confirm({ message: change.question(email), initialValue: change.initialValue }),
    );
    if (!go) throw new Cancelled("Nothing was changed.");
  }

  await cms.users[action](email);
  p.log.success(change.done(email));
}

/** The config file for a local-only command. @throws With `--url` or `TENON_URL`. */
function localOnly(action: string, flags: UsersFlags) {
  if (flags.url ?? process.env.TENON_URL)
    throw new Error(
      `tenon users ${action} works on the local project only. Run it where tenon.config.ts reaches the database.`,
    );
  return flags.config;
}

/**
 * A table of ID, name, email, role and status, one user per line.
 * @param options.color Colors the status: green when active, red when deactivated.
 */
export function formatUsers(users: UserSummary[], { color = false } = {}) {
  if (!users.length) return "No users yet.";
  const rows = [
    ["ID", "Name", "Email", "Role", "Status"],
    ...users.map((u) => [
      u.id,
      u.name,
      u.email,
      u.role ?? "-",
      u.deactivated ? "deactivated" : "active",
    ]),
  ];
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((row) => row[i]!.length)));
  return rows
    .map((row, r) => {
      const cells = row.map((cell, i) => cell.padEnd(widths[i]!));
      // The status is the last column, so it needs no padding, which the colors would break.
      const status = row.at(-1)!;
      if (color && r > 0)
        cells[cells.length - 1] = styleText(status === "active" ? "green" : "red", status, {
          validateStream: false,
        });
      return cells.join("  ").trimEnd();
    })
    .join("\n");
}

/** The choices of the role prompt, labeled in English. */
export const roleOptions = (roles: Role[]) =>
  roles.map((r) => ({
    value: r.name,
    label: translate(r.label, "en") ?? r.name,
    hint: translate(r.description, "en"),
  }));

/**
 * Invites a user and prints the invite link, also when it was emailed. `--password` creates the user directly
 * instead, locally only. With `--url` the invite goes through the admin API of a deployed instance.
 */
async function createCommand(email: string | undefined, flags: UsersFlags) {
  const url = flags.url ?? process.env.TENON_URL;
  if (url && flags.password)
    throw new Error(
      "--password works on the local project only. Without it, --url sends an invite.",
    );
  if (flags.password && !process.stdin.isTTY)
    throw new Error("--password asks for the password, so it needs a terminal.");
  email ??= await askEmail(flags);

  if (url) {
    const { client } = await remoteClient(url, flags["api-key"] ?? process.env.TENON_API_KEY);
    const role = await askRole(flags, "editor", async () => (await client.getSchema()).roles);
    const result = await client.invites.create({ email, role });
    return showLink(result, email, "Invite link");
  }

  const cms = await loadConfig(flags.config);
  const role = await askRole(flags, (await cms.users.hasUsers()) ? "editor" : "admin", () =>
    cms.users.roles(),
  );
  if (flags.password) {
    const user = await cms.users.create({
      email,
      role,
      name: await askName(email, flags),
      password: await answer(p.password({ message: "Password", validate: required })),
    });
    return p.log.success(`Created ${user.email} as ${user.role}`);
  }
  const result = await cms.users.invite({ email, role, url: await askedInvitePage(cms, flags) });
  showLink(result, email, "Invite link");
}

/**
 * Prints a link that signs the user in once, within an hour, and ends their other sessions. Local only: it needs the
 * database, not a session, so it also works when nobody can sign in.
 */
async function recoverCommand(email: string | undefined, flags: UsersFlags) {
  if (!email) throw new Error("Usage: tenon users recover <email>");
  const cms = await loadConfig(localOnly("recover", flags));
  const origin = await siteOrigin(cms, flags);

  if (!flags.yes) {
    if (!canAsk(flags)) throw new Error("Pass --yes to print a sign-in link without questions.");
    const go = await answer(
      p.confirm({
        message: `Create a sign-in link for ${email}? Opening it signs them out everywhere else.`,
        initialValue: true,
      }),
    );
    if (!go) throw new Cancelled("No link was created.");
  }

  showLink(await cms.users.signInLink(email, { origin }), email, "Sign-in link");
}

/** The origin of a fixed `baseURL`, else `undefined`. A dynamic one is an object of allowed hosts. */
export function configuredOrigin(baseURL: unknown) {
  return typeof baseURL === "string" ? new URL(baseURL).origin : undefined;
}

/** What to say about an email that went out, did not, or failed. */
export function deliveryNote(result: { sent: boolean; message?: string }, email: string) {
  if (result.sent) return { warn: false, text: `Emailed to ${email}. The link is below as well.` };
  if (result.message)
    return { warn: true, text: `${result.message}. Pass on the link below yourself.` };
  return { warn: true, text: "No email is set up. Pass on the link below yourself." };
}

function showLink(
  result: { link: string; sent: boolean; message?: string },
  email: string,
  title: string,
) {
  const note = deliveryNote(result, email);
  if (note.warn) p.log.warn(note.text);
  else p.log.success(note.text);
  p.log.step(title);
  // A box wraps a long link, which breaks copying and clicking. A plain line keeps it whole.
  console.log(result.link);
}

// `auth.baseURL`, else `site.url`, sets better-auth's `baseURL`, so it covers the usual case.
async function siteOrigin(cms: LocalCms, flags: UsersFlags) {
  const origin = configuredOrigin((await cms.auth()).options.baseURL);
  if (origin) return origin;
  if (!canAsk(flags))
    throw new Error(
      "The site's URL is unknown. Set `site.url` in tenon.config.ts, e.g. from TENON_SITE_URL=https://example.com.",
    );
  const answered = await answer(
    p.text({
      message: "Where does the site run?",
      initialValue: "http://localhost:4321",
      validate: (v) => (URL.canParse(v ?? "") ? undefined : "Enter the full URL, with https://"),
    }),
  );
  return new URL(answered).origin;
}

// Core links to the admin on the configured origin. Without one, the CLI asks where the site runs.
async function askedInvitePage(cms: LocalCms, flags: UsersFlags) {
  if (!cms.adminPath || configuredOrigin((await cms.auth()).options.baseURL)) return;
  return `${await siteOrigin(cms, flags)}${cms.adminPath}/invite`;
}

async function askEmail(flags: UsersFlags) {
  if (!canAsk(flags)) throw new Error("Usage: tenon users create <email>");
  return answer(p.text({ message: "Email", validate: required }));
}

/** `--role`, else a choice of the configured roles. `loadRoles` runs only when the CLI asks. */
async function askRole(
  flags: UsersFlags,
  initialValue: string,
  loadRoles: () => Promise<Role[] | undefined> | Role[],
) {
  if (flags.role || !canAsk(flags)) return flags.role ?? initialValue;
  const roles = (await loadRoles()) ?? BUILT_IN_ROLES;
  return answer(p.select({ message: "Role", initialValue, options: roleOptions(roles) }));
}

async function askName(email: string, flags: UsersFlags) {
  const initialValue = email.split("@")[0]!;
  if (!canAsk(flags)) return initialValue;
  return answer(p.text({ message: "Name", initialValue, validate: required }));
}

function required(value: string | undefined) {
  return value?.trim() ? undefined : "Required";
}
