import type { Core } from "../../cms/runtime/types.ts";
import { deleteApiKeyRow } from "../../db/queries/api-keys/delete-api-key.query.ts";
import { notFound } from "../../http/errors.ts";

/**
 * Deletes a key for good. Documents it wrote keep `key:<id>`, which no longer resolves.
 * @throws {HTTPException} 404 for an unknown key.
 */
export async function deleteApiKey(core: Core, id: string) {
  if (!(await deleteApiKeyRow(await core.db(), id))) throw notFound();
}
