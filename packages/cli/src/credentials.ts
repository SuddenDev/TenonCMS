import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** A session of `tenon login`, stored per origin. */
export type Credential = { token: string; email: string };

type Store = Record<string, Credential & { savedAt: string }>;

/** `$XDG_CONFIG_HOME/tenon/credentials.json`, else `~/.config/tenon/credentials.json`. */
export const credentialsFile = (env: Record<string, string | undefined> = process.env) =>
  join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "tenon", "credentials.json");

/** @returns The session for the origin of `url`, or `undefined` when there is none. */
export async function readCredential(url: string, file = credentialsFile()) {
  return (await readStore(file))[new URL(url).origin];
}

/** Stores the session for the origin of `url`. The file MUST stay readable by its owner only. */
export async function saveCredential(
  url: string,
  credential: Credential,
  file = credentialsFile(),
) {
  const store = await readStore(file);
  store[new URL(url).origin] = { ...credential, savedAt: new Date().toISOString() };
  await writeStore(file, store);
}

/** @returns `false` when there was no session for the origin of `url`. */
export async function removeCredential(url: string, file = credentialsFile()) {
  const store = await readStore(file);
  const origin = new URL(url).origin;
  if (!store[origin]) return false;
  delete store[origin];
  await writeStore(file, store);
  return true;
}

async function readStore(file: string): Promise<Store> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return {};
  }
}

async function writeStore(file: string, store: Store) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  // `mode` applies only to a new file.
  await chmod(file, 0o600);
}
