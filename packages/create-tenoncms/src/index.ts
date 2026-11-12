#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { parseArgs, styleText } from "node:util";
import * as p from "@clack/prompts";
import { fetchTemplates, readIndex, scaffold, toPackageName } from "./scaffold.ts";

const SOURCE = "gh:SuddenDev/TenonCMS/templates";
const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
type PackageManager = (typeof PACKAGE_MANAGERS)[number];

const HELP = `Usage: npm create tenoncms [dir] [options]

  --framework <name>    astro, nuxt, tanstack or standalone
  --template <name>     The starter. Default: minimal
  --target <name>       node, vercel or cloudflare (Astro only)
  --database <name>     node: libsql, postgres, pglite or sqlite. vercel: libsql or postgres
  --storage <name>      node: local or s3. vercel: s3
  --pm <name>           npm, pnpm, yarn or bun
  --install, --no-install
  --git, --no-git
  --yes                 Take the defaults for everything not given
  --templates <source>  A giget source or a local folder. Default: ${SOURCE}
`;

class Cancelled extends Error {}

async function answer<T>(prompt: Promise<T>): Promise<Exclude<T, symbol>> {
  const value = await prompt;
  if (p.isCancel(value)) throw new Cancelled("Cancelled");
  return value as Exclude<T, symbol>;
}

async function main() {
  const [major] = process.versions.node.split(".").map(Number);
  if (major! < 24)
    throw new Error(`create-tenoncms needs Node 24 or newer, this is ${process.version}`);
  const { values: flags, positionals } = parseArgs({
    allowPositionals: true,
    allowNegative: true,
    options: {
      framework: { type: "string" },
      template: { type: "string" },
      target: { type: "string" },
      database: { type: "string" },
      storage: { type: "string" },
      pm: { type: "string" },
      install: { type: "boolean" },
      git: { type: "boolean" },
      yes: { type: "boolean", short: "y" },
      templates: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (flags.help) return void process.stdout.write(HELP);
  const ask = !flags.yes && !!process.stdin.isTTY;

  p.intro(styleText("inverse", " create-tenoncms "));
  const dir = resolve(
    positionals[0] ??
      (ask
        ? await answer(
            p.text({
              message: "Where should the project go?",
              initialValue: "my-site",
              validate: (v) => (v?.trim() ? undefined : "Enter a folder"),
            }),
          )
        : "my-site"),
  );
  await prepareFolder(dir, ask);

  const spin = p.spinner();
  spin.start("Fetching the templates");
  const root = await fetchTemplates(flags.templates ?? process.env.TENON_TEMPLATES ?? SOURCE).catch(
    (error: unknown) => {
      spin.error("Fetching the templates");
      throw error;
    },
  );
  spin.stop("Fetched the templates");
  const index = await readIndex(root);

  const framework = await choose(index.frameworks, flags.framework, "Which framework?", ask);
  const templates = pick(index.templates, (t) => t.frameworks.includes(framework));
  const template = await choose(templates, flags.template, "Which template?", ask);
  const targets = pick(index.targets, (_, key) =>
    index.frameworks[framework]!.targets.includes(key),
  );
  const target = await choose(targets, flags.target, "Where will it run?", ask);
  const { databases, storages, envFile = ".env" } = index.targets[target]!;
  // The target's order: its first database and storage are the defaults.
  const database = await choose(
    Object.fromEntries(databases.map((id) => [id, index.databases[id]!])),
    flags.database,
    "Which database?",
    ask,
  );
  const storage = await choose(
    Object.fromEntries(storages.map((id) => [id, index.storages[id]!])),
    flags.storage,
    "Where should media files go?",
    ask,
  );
  const detected = detectPackageManager();
  const pm = (flags.pm ??
    (ask
      ? await answer(
          p.select({
            message: "Which package manager?",
            initialValue: detected,
            options: PACKAGE_MANAGERS.map((value) => ({ value, label: value })),
          }),
        )
      : detected)) as PackageManager;
  if (!PACKAGE_MANAGERS.includes(pm)) throw new Error(`Unknown package manager ${pm}`);
  const install =
    flags.install ?? (ask ? await answer(p.confirm({ message: "Install dependencies?" })) : true);
  const git =
    flags.git ??
    (ask ? await answer(p.confirm({ message: "Initialize a git repository?" })) : true);

  spin.start("Creating the project");
  await scaffold(root, dir, {
    name: toPackageName(basename(dir)),
    framework,
    template,
    target,
    database,
    storage,
    pm,
    tenonVersion: await latestTenon(),
  });
  spin.stop(`Created ${relative(process.cwd(), dir) || "."}`);

  if (install) run(pm, ["install"], dir, `${pm} install`);
  if (git) initGit(dir);

  const cd = relative(process.cwd(), dir);
  const steps = [
    cd && `cd ${cd}`,
    !install && `${pm} install`,
    target === "cloudflare" && `${pm} run types`,
    `${pm} run dev`,
  ].filter(Boolean);
  p.note(steps.join("\n"), "Next steps");
  if (database === "postgres")
    p.log.info(`Set DATABASE_URL in ${envFile} to your Postgres database.`);
  if (storage === "s3") p.log.info(`Set the bucket in ${envFile}: S3_BUCKET and the AWS_* keys.`);
  if (target === "vercel")
    p.log.info(
      `On Vercel, set the variables of ${envFile} in the project settings.${database === "libsql" ? " DATABASE_URL MUST be a Turso URL there." : ""}`,
    );
  p.outro("Open /admin to create the first admin.");
}

/** Empties or keeps a folder that has files, after asking. Without a terminal it MUST be empty. */
async function prepareFolder(dir: string, ask: boolean) {
  if (!existsSync(dir) || !readdirSync(dir).length) return;
  if (!ask) throw new Error(`${dir} is not empty.`);
  const action = await answer(
    p.select({
      message: `${basename(dir)} is not empty.`,
      options: [
        { value: "cancel", label: "Cancel" },
        { value: "empty", label: "Delete its files and continue" },
        { value: "keep", label: "Keep its files and continue" },
      ],
    }),
  );
  if (action === "cancel") throw new Cancelled("Cancelled");
  if (action === "empty")
    for (const file of readdirSync(dir))
      await rm(resolve(dir, file), { recursive: true, force: true });
}

async function choose(
  options: Record<string, { label: string; hint?: string }>,
  flag: string | undefined,
  message: string,
  ask: boolean,
) {
  const keys = Object.keys(options);
  if (flag) {
    if (!keys.includes(flag)) throw new Error(`${flag} is not one of ${keys.join(", ")}`);
    return flag;
  }
  if (keys.length === 1 || !ask) {
    p.log.step(`${message} ${options[keys[0]!]!.label}`);
    return keys[0]!;
  }
  return answer(
    p.select({
      message,
      options: keys.map((value) => ({
        value,
        label: options[value]!.label,
        hint: options[value]!.hint,
      })),
    }),
  );
}

function pick<T>(record: Record<string, T>, keep: (value: T, key: string) => boolean) {
  return Object.fromEntries(Object.entries(record).filter(([k, v]) => keep(v, k)));
}

function detectPackageManager(): PackageManager {
  const name = (process.env.npm_config_user_agent ?? "").split("/")[0];
  return PACKAGE_MANAGERS.find((pm) => pm === name) ?? "npm";
}

// `undefined` offline. The template's `latest` then stays.
async function latestTenon() {
  const res = await fetch("https://registry.npmjs.org/tenoncms/latest").catch(() => undefined);
  return res?.ok ? ((await res.json()) as { version?: string }).version : undefined;
}

function run(command: string, args: string[], cwd: string, label: string) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) p.log.warn(`${label} failed. Run it yourself in the project.`);
  return result.status === 0;
}

// The commit needs a git identity. Without one the repository stays without a commit.
function initGit(cwd: string) {
  const git = (...args: string[]) => spawnSync("git", args, { cwd, stdio: "ignore" }).status === 0;
  if (!git("init")) return void p.log.warn("git init failed.");
  if (!(git("add", "-A") && git("commit", "-m", "chore: initial commit")))
    p.log.warn("Created the repository, but could not commit. Commit the files yourself.");
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    if (error instanceof Cancelled) p.cancel(error.message);
    else p.log.error((error as Error).message);
    process.exit(1);
  },
);
