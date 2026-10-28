import type { CmsUser } from "../../admin/index.d.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { findApiKeys } from "../../db/queries/api-keys/find-api-keys.query.ts";
import { toApiKey } from "../to-api-key.ts";
import type { ApiKeyPermissions, NewApiKey } from "../types.ts";

// `Core` hides better-auth's API from the type checker, so the method is typed here.
type Api = {
  createApiKey(context: { body: object }): Promise<{ id: string; key: string }>;
};

/**
 * Creates a key through better-auth, which stores only its hash. `creator` is recorded; the key does not act as them.
 * Empty grants are left out.
 * @param expiresIn Seconds until the key expires. Without it, the key does not expire.
 * @returns The key with its secret. The secret is never readable again.
 */
export async function createApiKey(
  core: Core,
  creator: CmsUser,
  input: { name: string; permissions: Partial<ApiKeyPermissions>; expiresIn?: number },
): Promise<NewApiKey> {
  const permissions = Object.fromEntries(
    Object.entries(input.permissions).flatMap(([target, ops]) =>
      ops?.length ? [[target, [...new Set(ops)]]] : [],
    ),
  );

  const { api } = (await core.auth()) as unknown as { api: Api };
  // A call without headers is trusted, so it passes `apiKeyRoutesOff()` and MAY set the permissions.
  const { id, key } = await api.createApiKey({
    body: {
      userId: creator.id,
      name: input.name,
      expiresIn: input.expiresIn ?? null,
      permissions,
    },
  });

  const [row] = await findApiKeys(await core.db(), id);
  return { ...toApiKey(row), key };
}
