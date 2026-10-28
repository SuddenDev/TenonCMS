import { API_BASE } from "./constants.ts";
import { CmsError } from "./errors.ts";
import type { ClientOptions } from "./types/index.ts";

/**
 * Binds the origin, `fetch` and `auth` headers of one client. `request()` sends `body` as JSON and `query` as the
 * query string, without `undefined` values.
 * @returns `request(method, path, body?, query?)`. It resolves to the parsed body, or `null` for a `204` or a
 * body that is not JSON, and throws a `CmsError` for a non-2xx status.
 */
export function createRequest(
  baseUrl: string,
  fetchFn: NonNullable<ClientOptions["fetch"]>,
  auth: Record<string, string> = {},
) {
  return async function request(method: string, path: string, body?: unknown, query?: object) {
    const params = new URLSearchParams(
      Object.entries(query ?? {}).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, String(value)]],
      ),
    );
    const search = params.size ? `?${params}` : "";

    const res = await fetchFn(`${baseUrl}${API_BASE}${path}${search}`, {
      method,
      headers: body === undefined ? auth : { ...auth, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new CmsError(res.status, data);
    return data;
  };
}

/** The bound request function of one client. */
export type Request = ReturnType<typeof createRequest>;
