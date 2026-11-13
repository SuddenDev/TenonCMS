import { existsSync } from "node:fs";
import { resolve } from "node:path";

type Config = Record<string, unknown>;

/**
 * The `runtimeConfig` of the Nuxt project in `cwd`, as the server's `useRuntimeConfig()` returns it: the values of
 * `nuxt.config.*` and its layers, with the `NITRO_*` and `NUXT_*` variables over them.
 * @returns `undefined` when `cwd` has no `nuxt.config.*`.
 */
export async function loadNuxtRuntimeConfig(cwd: string, env = process.env) {
  const configs = ["ts", "mts", "js", "mjs"].map((ext) => resolve(cwd, `nuxt.config.${ext}`));
  if (!configs.some(existsSync)) return;
  const { loadNuxtConfig } = await import("@nuxt/kit");
  const { runtimeConfig } = await loadNuxtConfig({ cwd });
  return applyEnv(structuredClone(runtimeConfig) as Config, env);
}

/**
 * Nitro's rule: `databaseUrl` reads `NITRO_DATABASE_URL`, then `NUXT_DATABASE_URL`; `public.apiBase` reads
 * `NUXT_PUBLIC_API_BASE`. A value that parses as JSON becomes that value; an object merges into the object it
 * replaces. Mutates `config`.
 */
export function applyEnv(config: Config, env: Record<string, string | undefined>, parent = "") {
  for (const [key, value] of Object.entries(config)) {
    const path = parent ? `${parent}_${key}` : key;
    const name = path
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/-/g, "_")
      .toUpperCase();
    const raw = env[`NITRO_${name}`] ?? env[`NUXT_${name}`];
    const parsed = raw === undefined ? undefined : parseValue(raw);
    if (isObject(value) && (parsed === undefined || isObject(parsed)))
      applyEnv((config[key] = { ...value, ...(parsed as Config) }), env, path);
    else if (parsed !== undefined) config[key] = parsed;
  }
  return config;
}

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const isObject = (value: unknown): value is Config =>
  !!value && typeof value === "object" && !Array.isArray(value);
