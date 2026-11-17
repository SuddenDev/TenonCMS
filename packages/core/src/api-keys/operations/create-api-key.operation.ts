import { z } from "zod";
import type { CmsUser } from "../../admin/index.d.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { findApiKeys } from "../../db/queries/api-keys/find-api-keys.query.ts";
import { validateInput } from "../../schema/validation/validate-input.ts";
import { toApiKey } from "../to-api-key.ts";
import { apiKeyTargets, type ApiKeyPermissions, type NewApiKey } from "../types.ts";

const DAY = 86_400;

// `Core` hides better-auth's API from the type checker, so the method is typed here.
type Api = {
  createApiKey(context: { body: object }): Promise<{ id: string; key: string }>;
};

/**
 * The input of a new key. The grid MUST only name the schema's targets, each with its operations, so a key never
 * holds a name the schema lacks. better-auth limits names to 32 characters and expiry to between 1 and 365 days.
 */
function apiKeyInput(schema: Core["schema"]) {
  const grid = Object.entries(apiKeyTargets(schema)).map(
    ([name, ops]) => [name, z.array(z.enum(ops)).optional()] as const,
  );
  return z.object({
    name: z.string().trim().min(1).max(32),
    permissions: z.strictObject(Object.fromEntries(grid)),
    expiresIn: z
      .number()
      .int()
      .min(DAY)
      .max(365 * DAY)
      .optional(),
  });
}

/**
 * Creates a key through better-auth, which stores only its hash. `creator` is recorded; the key does not act as them.
 * Empty grants are left out.
 * @param data `expiresIn` is in seconds. Without it, the key does not expire.
 * @returns The key with its secret. The secret is never readable again.
 * @throws {ValidationError} For a target or operation the schema lacks, a bad name or expiry (`apiKeyInput()`).
 */
export async function createApiKey(
  core: Core,
  creator: CmsUser,
  data: { name: string; permissions: Partial<ApiKeyPermissions>; expiresIn?: number },
): Promise<NewApiKey> {
  const { name, expiresIn, ...valid } = validateInput(apiKeyInput(core.schema), data);
  const permissions = Object.fromEntries(
    Object.entries(valid.permissions).flatMap(([target, ops]) =>
      ops?.length ? [[target, [...new Set(ops)]]] : [],
    ),
  );

  const { api } = (await core.auth()) as unknown as { api: Api };
  // A call without headers is trusted, so it passes `apiKeyRoutesOff()` and MAY set the permissions.
  const { id, key } = await api.createApiKey({
    body: { userId: creator.id, name, expiresIn: expiresIn ?? null, permissions },
  });

  const [row] = await findApiKeys(await core.db(), id);
  return { ...toApiKey(row), key };
}
