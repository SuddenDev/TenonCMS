import { requireKeyGrant } from "../../../access/rule.ts";
import { actorId } from "../../../cms/runtime/operation-context.ts";
import type { Core, Scope } from "../../../cms/runtime/types.ts";
import { collectionTarget } from "../../../content/targets.ts";
import { databaseForScope } from "../../../cms/runtime/transaction.ts";
import type { UploadRow } from "../../../db/types.ts";
import { mediaUploadById } from "../../../db/queries/uploads/media-upload-by-id.query.ts";

// An upload takes four steps, each its own request: `create`, `putPart` per part (proxied storage only), then
// `complete` or `abort`. `upload()` runs them in one call for the local API.

/** How long an upload stays valid, in milliseconds. */
export const DAY = 24 * 60 * 60 * 1000;

/**
 * The upload `id` of the scope's user or API key, or `undefined` for an unknown, expired or foreign one. Parts,
 * completion and abort all load the upload here. Uploads into a dot folder are archives of an import, never media.
 * @throws {ForbiddenError} 403 for an API key without `create` on media.
 */
export async function findUpload(core: Core, scope: Scope, id: string) {
  requireKeyGrant(scope, collectionTarget("media"), "create");
  const db = await databaseForScope(core, scope);
  return ownUnexpiredUpload(scope, await mediaUploadById(db, id));
}

/** The `row` if the scope's user or API key started it within a day, otherwise `undefined`. */
export function ownUnexpiredUpload(scope: Scope, row: UploadRow | undefined) {
  const mine = row && row.user_id === actorId(scope);
  return mine && row.created_at > Date.now() - DAY ? row : undefined;
}
