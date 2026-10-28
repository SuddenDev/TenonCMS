import type { Core } from "../../cms/runtime/types.ts";
import { disableApiKey } from "../../db/queries/api-keys/disable-api-key.query.ts";
import { notFound } from "../../http/errors.ts";

/**
 * Disables a key. It stays listed, so documents it wrote keep a name.
 * @throws {HTTPException} 404 for an unknown key.
 */
export async function revokeApiKey(core: Core, id: string) {
  if (!(await disableApiKey(await core.db(), id))) throw notFound();
}
