import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import * as p from "@clack/prompts";
import { CmsError, createClient, type Session } from "../client/index.ts";
import { readCredential, removeCredential, saveCredential } from "./credentials.ts";
import { answer, canAsk, spinning } from "./ui.ts";

export type LoginFlags = { url?: string; admin?: string; open?: boolean; yes?: boolean };

/**
 * `tenon login <url>`: better-auth's device flow. Shows a code, opens the admin to approve it, polls for the session
 * token and stores it per origin. The session lasts as long as better-auth's sessions (7 days by default, renewed
 * on use).
 */
export async function loginCommand(url: string | undefined, flags: LoginFlags) {
  url ??= flags.url ?? process.env.TENON_URL;
  if (!url && canAsk(flags))
    url = await answer(
      p.text({
        message: "Which site do you want to sign in to?",
        placeholder: "https://example.com",
        validate: (v) => (URL.canParse(v ?? "") ? undefined : "Enter the full URL, with https://"),
      }),
    );
  const origin = requireOrigin(url);
  const client = createClient({ baseUrl: origin });

  const code = await client.device.code();
  const page = new URL(code.verification_uri_complete);
  // The server picks the link. Only its own origin over http(s) MAY open, so it cannot name a program or file.
  if (page.origin !== origin || !/^https?:$/.test(page.protocol))
    throw new Error(`The server sent an unexpected verification link: ${page}`);
  if (flags.admin) page.pathname = `/${flags.admin.replace(/^\/+|\/+$/g, "")}/device`;
  p.note(`${page}\n\nCode: ${code.user_code}`, "Approve this code in the admin");
  if (flags.open !== false) openBrowser(String(page));

  await spinning(
    "Waiting for the approval",
    async () => {
      const token = await pollToken(client, code.device_code, code.interval, code.expires_in);
      const { user } = await sessionOf(origin, token);
      await saveCredential(origin, { token, email: user.email });
      return user.email;
    },
    (email) => `Signed in to ${origin} as ${email}`,
  );
}

/** `tenon logout <url>`: ends the session on the server, then forgets it here. */
export async function logoutCommand(url: string | undefined, flags: LoginFlags) {
  const origin = requireOrigin(url ?? flags.url);
  const credential = await readCredential(origin);
  if (credential)
    await fetch(`${origin}/_tenon/auth/sign-out`, {
      method: "POST",
      headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json" },
      body: "{}",
    }).catch(() => {});
  p.log.info(
    (await removeCredential(origin)) ? `Signed out of ${origin}` : `Not signed in to ${origin}`,
  );
}

function requireOrigin(url: string | undefined) {
  url ??= process.env.TENON_URL;
  if (!url)
    throw new Error(
      "Usage: tenon login <url>, e.g. tenon login https://example.com. Backups of the local project need no login.",
    );
  return new URL(url).origin;
}

// RFC 8628: wait `interval` seconds between polls, 5 more after `slow_down`.
async function pollToken(
  client: ReturnType<typeof createClient>,
  deviceCode: string,
  interval: number,
  expiresIn: number,
) {
  const deadline = Date.now() + expiresIn * 1000;
  let wait = interval;
  while (Date.now() < deadline) {
    await sleep(wait * 1000);
    try {
      return (await client.device.token(deviceCode)).access_token;
    } catch (error) {
      const reason =
        error instanceof CmsError ? (error.body as { error?: string })?.error : undefined;
      if (reason === "slow_down") wait += 5;
      else if (reason !== "authorization_pending") throw new Error(denial(reason, error));
    }
  }
  throw new Error("The code expired. Run tenon login again.");
}

function denial(reason: string | undefined, error: unknown) {
  if (reason === "access_denied") return "The sign-in was denied.";
  if (reason === "expired_token") return "The code expired. Run tenon login again.";
  return (error as Error).message;
}

async function sessionOf(origin: string, token: string): Promise<Session> {
  const res = await fetch(`${origin}/_tenon/auth/get-session`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const session = (await res.json().catch(() => null)) as Session | null;
  if (!session?.user) throw new Error("The server did not accept the new session.");
  return session;
}

// Best effort: the code and link are printed, so a failed open changes nothing. No shell parses `url`.
function openBrowser(url: string) {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  spawn(command, args, { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
}
