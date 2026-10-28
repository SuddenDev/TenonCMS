import type { Core } from "../../cms/runtime/types.ts";
import { findApiKeys } from "../../db/queries/api-keys/find-api-keys.query.ts";
import { toApiKey } from "../to-api-key.ts";

/** Every key, revoked ones included. */
export async function listApiKeys(core: Core) {
  return (await findApiKeys(await core.db())).map(toApiKey);
}
