import { getBaseURL, type BetterAuthOptions } from "better-auth";

/**
 * better-auth's `baseURL`: the given one (`auth.baseURL`, else `site.url`), then better-auth's URL environment
 * variables, then in development a dynamic allowlist of loopback and adapter-configured hosts.
 * @returns `undefined` in production without a URL, so better-auth derives it from the request.
 */
export function authBaseURL(
  baseURL?: BetterAuthOptions["baseURL"],
  requestOrigin?: string,
): BetterAuthOptions["baseURL"] {
  if (baseURL) return baseURL;
  const fromEnv = getBaseURL(undefined, "/");
  if (fromEnv) return fromEnv;

  const env =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  if (!isDevelopment(env)) return;
  const origin = env.__TENON_DEV_ORIGIN || requestOrigin;

  const allowedHosts = ["localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*", "[::1]", "[::1]:*"];
  if (origin) {
    const { hostname, host } = new URL(origin);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) allowedHosts.push(host);
  }
  return { allowedHosts, ...(origin && { fallback: origin }) };
}

/** Only a loopback or adapter-configured host MAY seed a worker's requestless fallback. */
export function developmentRequestOrigin(request: Request): string | undefined {
  const env =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  if (!isDevelopment(env)) return;
  const url = new URL(request.url);
  const configuredHost = env.__TENON_DEV_ORIGIN
    ? new URL(env.__TENON_DEV_ORIGIN).hostname
    : import.meta.env?.TENON_DEV_HOST;
  if (
    ["http:", "https:"].includes(url.protocol) &&
    ["localhost", "127.0.0.1", "[::1]", configuredHost].includes(url.hostname)
  )
    return url.origin;
}

function isDevelopment(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === "development" || (!env.NODE_ENV && import.meta.env?.DEV === true);
}
