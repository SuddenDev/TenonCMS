/**
 * Mounts the admin on an admin page or an isolated iframe and returns the cleanup.
 * Branding comes from `/admin-brand` and the registrations from `/schema` after sign-in.
 * @param base Path the admin is served at. Defaults to `/admin`.
 * @param favicon Favicon of the host, used when the branding sets none.
 * @param registry Browser exports found in the server configuration, by `clientRef()` specifier.
 */
export function mountAdmin(
  el: string | Element,
  base?: string,
  favicon?: string | null,
  registry?: Record<string, () => Promise<unknown>>,
): () => void;
