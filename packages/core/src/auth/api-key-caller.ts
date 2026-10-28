import type { ApiKeyCaller, ApiKeyPermissions } from "../api-keys/types.ts";

// `Core` hides better-auth's API from the type checker, so the method is typed here.
type Api = {
  verifyApiKey(context: { body: { key: string } }): Promise<{
    key: { id: string; name: string | null; permissions: ApiKeyPermissions | null } | null;
  }>;
};

/**
 * Verifies an API key. Verifying counts a use of the key.
 * @returns The key, or `null` for an unknown, revoked or expired key.
 */
export async function apiKeyCaller(auth: unknown, key: string): Promise<ApiKeyCaller | null> {
  const { key: found } = await (auth as { api: Api }).api.verifyApiKey({ body: { key } });
  if (!found) return null;
  return { id: found.id, name: found.name, permissions: found.permissions ?? {} };
}
