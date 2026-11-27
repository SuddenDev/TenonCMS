import { API_BASE } from "./constants.ts";
import { CmsError } from "./errors.ts";
import type { ClientOptions } from "./types/index.ts";

/**
 * Binds the origin, `fetch` and `auth` headers of one client. `request()` sends `body` as JSON and `query` as the
 * query string, without `undefined` values.
 * @returns `request(method, path, body?, query?)`. It resolves to the parsed body, or `null` for a `204`. It throws as
 * {@link readReply} does.
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

    // A `Blob` goes as it is, with its own type. Anything else is JSON.
    const raw = body instanceof Blob;
    const type = raw ? body.type || "application/octet-stream" : "application/json";
    const res = await fetchFn(`${baseUrl}${API_BASE}${path}${search}`, {
      method,
      headers: body === undefined ? auth : { ...auth, "content-type": type },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });

    return readReply(res, `${method} ${path}`);
  };
}

/**
 * The parsed body of an API answer, or `null` for a `204`. `label` names the request in the error.
 * @throws A `CmsError` for a non-2xx status, and for a 2xx body that is not JSON. That is never the API's own answer,
 * e.g. a host page for a method that its route does not hand to the CMS.
 */
export async function readReply(res: Response, label: string) {
  if (res.status === 204) return null;
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new CmsError(res.status, data ?? null);
  if (data === undefined)
    throw new CmsError(res.status, { message: `${label} answered ${res.status} without JSON` });
  return data;
}

/** The bound request function of one client. */
export type Request = ReturnType<typeof createRequest>;
