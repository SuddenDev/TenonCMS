import { createWriteStream, existsSync } from "node:fs";
import { readFile, rename, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { LocalApi } from "../index.ts";
import {
  API_KEY_HEADER,
  type ArchiveCheck,
  type ArchiveCounts,
  createClient,
  type ExportOptions,
  type ImportCounts,
  type Manifest,
} from "../client/index.ts";
import { readCredential } from "./credentials.ts";

/** Where `tenon backup` reads from and `tenon restore` writes to: a config loaded here, or an instance over HTTP. */
export type Target = {
  /** The URL or the config file, for messages. */
  label: string;
  /** The host or the package name, for the file name of a backup. */
  name: string;
  /** Whether it is reached over HTTP, where a restore ends the CLI's session too. */
  remote: boolean;
  summary(options: ExportOptions): Promise<ArchiveCounts>;
  /** Writes the archive into `file`. A failed download leaves no file behind. */
  exportTo(file: string, options: ExportOptions, onBytes: (n: number) => void): Promise<void>;
  check(archive: Blob, manifest: Manifest): Promise<ArchiveCheck>;
  /** Restores with `mode: "replace"`. */
  restore(archive: Blob, onBytes: (n: number) => void): Promise<ImportCounts>;
};

export type TargetFlags = { url?: string; "api-key"?: string; config?: string };

/**
 * `--url` (or `TENON_URL`) talks HTTP with `--api-key` (or `TENON_API_KEY`), else the session of `tenon login`.
 * Without a URL, it loads `--config` (default `tenon.config.ts`) here.
 * @throws When the URL has no key and no session, or the config cannot run here.
 */
export async function openTarget(flags: TargetFlags): Promise<Target> {
  const url = flags.url ?? process.env.TENON_URL;
  return url
    ? openRemote(url, flags["api-key"] ?? process.env.TENON_API_KEY)
    : openLocal(flags.config);
}

async function openRemote(url: string, apiKey: string | undefined): Promise<Target> {
  const origin = new URL(url).origin;
  const token = apiKey ? undefined : (await readCredential(origin))?.token;
  if (!apiKey && !token)
    throw new Error(`Not signed in to ${origin}. Run tenon login ${origin}, or pass --api-key.`);
  // The key or session goes to this origin only. Presigned storage URLs refuse a second credential.
  const fetchFn: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (new URL(String(input instanceof Request ? input.url : input)).origin === origin) {
      if (apiKey) headers.set(API_KEY_HEADER, apiKey);
      else headers.set("authorization", `Bearer ${token}`);
    }
    return fetch(input, { ...init, headers });
  };
  const client = createClient({ baseUrl: origin, fetch: fetchFn });
  return {
    label: origin,
    name: new URL(origin).hostname,
    remote: true,
    summary: (options) => client.exportSummary(options),
    async exportTo(file, options, onBytes) {
      const res = await fetchFn(await client.exportLink(options));
      if (!res.ok || !res.body) throw new Error(`The download failed with status ${res.status}`);
      await writeArchive(file, res.body, onBytes);
    },
    check: (_archive, manifest) => client.checkImport(manifest, { mode: "replace" }),
    restore: (archive, onBytes) =>
      client.import(archive, { mode: "replace", onProgress: (p) => onBytes(p.loaded) }),
  };
}

async function openLocal(config = "tenon.config.ts"): Promise<Target> {
  const cms = await loadConfig(resolve(config));
  return {
    label: `the database of ${config}`,
    name: await packageName(),
    remote: false,
    summary: (options) => cms.exportSummary(options),
    exportTo: async (file, options, onBytes) =>
      writeArchive(file, await cms.export(options), onBytes),
    check: (archive) => cms.import(archive, { mode: "replace", dryRun: true }),
    restore: (archive) => cms.import(archive, { mode: "replace" }),
  };
}

async function packageName() {
  const pkg = await readFile("package.json", "utf8").then(JSON.parse, () => ({}));
  return (pkg.name as string | undefined)?.split("/").at(-1) ?? basename(process.cwd());
}

/**
 * Loads the host's config through Vite, like its dev server, so TypeScript, its imports and `.client` modules work, as
 * in a server build. `astro:env/*` reads
 * `process.env`, which gets `.env` first. A config that imports other platform modules (`cloudflare:workers`) only
 * runs on its platform.
 */
async function loadConfig(path: string): Promise<LocalApi> {
  const { loadEnv, runnerImport } = await import("vite");
  const { clientModules } = await import("../integrations/vite/index.ts");
  for (const [key, value] of Object.entries(loadEnv("production", process.cwd(), "")))
    process.env[key] ??= value;
  const inline = { configFile: false as const, logLevel: "error" as const };
  try {
    const defaults = await astroEnvDefaults((id) => runnerImport(id, inline));
    const { module } = await runnerImport<{ default?: LocalApi }>(path, {
      ...inline,
      plugins: [clientModules({ server: true }), astroEnv(defaults)],
    });
    if (!module.default?.export) throw new Error(`${path} has no default export of defineCms()`);
    return module.default;
  } catch (error) {
    if (/cloudflare:/.test(String(error)))
      throw new Error(
        `${path} only runs on Cloudflare. Pass --url to reach the deployed instance.`,
        {
          cause: error,
        },
      );
    throw error;
  }
}

type AstroEnvSchema = Record<string, { default?: unknown }>;

// The defaults of `env.schema` in an `astro.config.*` next to the config, which `astro:env` would apply.
async function astroEnvDefaults(load: (id: string) => Promise<{ module: unknown }>) {
  const file = ["ts", "mjs", "js"].map((ext) => resolve(`astro.config.${ext}`)).find(existsSync);
  if (!file) return {};
  // Without the defaults, unset variables stay undefined, as without Astro.
  const module = await load(file).then(
    (r) => r.module,
    () => undefined,
  );
  const schema = (module as { default?: { env?: { schema?: AstroEnvSchema } } }).default?.env
    ?.schema;
  return Object.fromEntries(
    Object.entries(schema ?? {}).flatMap(([k, field]) =>
      field.default === undefined ? [] : [[k, field.default]],
    ),
  );
}

// `astro:env/server` and `astro:env/client` as `process.env` over the schema's defaults.
function astroEnv(defaults: Record<string, unknown>) {
  const prefix = "\0tenon:astro-env:";
  return {
    name: "tenon:astro-env",
    resolveId: (id: string) => (id.startsWith("astro:env/") ? prefix + id : undefined),
    load(id: string) {
      if (!id.startsWith(prefix)) return;
      const names = new Set([...Object.keys(defaults), ...Object.keys(process.env)]);
      return [...names]
        .filter((k) => /^[A-Za-z_$][\w$]*$/.test(k))
        .map(
          (k) =>
            `export const ${k} = process.env[${JSON.stringify(k)}] ?? ${JSON.stringify(defaults[k])};`,
        )
        .join("\n");
    },
  };
}

async function writeArchive(
  file: string,
  body: ReadableStream<Uint8Array>,
  onBytes: (n: number) => void,
) {
  const part = `${file}.part`;
  let bytes = 0;
  const count = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      onBytes((bytes += chunk.length));
      done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as never), count, createWriteStream(part));
    await rename(part, file);
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}
