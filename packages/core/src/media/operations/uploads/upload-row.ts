import type { Kysely, Selectable } from "kysely";
import { requireKeyGrant } from "../../../access/rule.ts";
import { actorId } from "../../../cms/runtime/operation-context.ts";
import type { Core, Scope } from "../../../cms/runtime/types.ts";
import { collectionTarget } from "../../../content/targets.ts";
import { databaseForScope } from "../../../cms/runtime/transaction.ts";
import type { Database } from "../../../db/types.ts";

// An upload takes four steps, each its own request: `create`, `putPart` per part (proxied storage only), then
// `complete` or `abort`. `upload()` runs them in one call for the local API.

/** One row of `cms_uploads`: an upload in progress. */
export type Row = Selectable<Database["cms_uploads"]>;

/** How long an upload stays valid, in milliseconds. */
export const DAY = 24 * 60 * 60 * 1000;

/**
 * The upload `id` of the scope's user or API key, or `undefined` for an unknown, expired or foreign one. Parts,
 * completion and abort all load the upload here.
 * @throws {ForbiddenError} 403 for an API key without `create` on media.
 */
export async function findUpload(core: Core, scope: Scope, id: string) {
  requireKeyGrant(scope, collectionTarget("media"), "create");
  const db = await databaseForScope(core, scope);
  const row = await db
    .selectFrom("cms_uploads")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  const mine = row && row.user_id === actorId(scope);
  return mine && row.created_at > Date.now() - DAY ? row : undefined;
}

/** Deletes the upload row `id`. */
export async function deleteUpload(db: Kysely<Database>, id: string) {
  await db.deleteFrom("cms_uploads").where("id", "=", id).execute();
}
