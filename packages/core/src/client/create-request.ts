import { API_BASE } from "./constants.ts";
import { CmsError } from "./errors.ts";
import type { ClientOptions } from "./types.ts";

export function createRequest(baseUrl: string, fetchFn: NonNullable<ClientOptions["fetch"]>) {
  return async function request(method: string, path: string, body?: unknown, query?: object) {
    const params = new URLSearchParams(
      Object.entries(query ?? {}).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, String(value)]],
      ),
    );
    const search = params.size ? `?${params}` : "";
    const res = await fetchFn(`${baseUrl}${API_BASE}${path}${search}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new CmsError(res.status, data);
    return data;
  };
}
