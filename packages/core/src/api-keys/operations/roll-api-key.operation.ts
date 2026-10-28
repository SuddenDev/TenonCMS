import { newApiKeySecret } from "../../auth/config/api-keys.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { findApiKeys } from "../../db/queries/api-keys/find-api-keys.query.ts";
import { replaceApiKeySecret } from "../../db/queries/api-keys/replace-api-key-secret.query.ts";
import { notFound } from "../../http/errors.ts";
import { toApiKey } from "../to-api-key.ts";
import type { NewApiKey } from "../types.ts";

/**
 * Gives an active key a new secret. better-auth has no rotation, so the hash is replaced in place: the id stays, and
 * with it the grid, the expiry and the `key:<id>` authors. The old secret stops at once.
 * @returns The key with its new secret. The secret is never readable again.
 * @throws {HTTPException} 404 for an unknown or revoked key.
 */
export async function rollApiKey(core: Core, id: string): Promise<NewApiKey> {
  const db = await core.db();
  const { key, hash, start } = await newApiKeySecret();
  if (!(await replaceApiKeySecret(db, id, hash, start))) throw notFound();

  const [row] = await findApiKeys(db, id);
  return { ...toApiKey(row), key };
}
