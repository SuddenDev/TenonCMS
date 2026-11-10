import { sql } from "kysely";
import { type Db } from "../document-sql.ts";

/**
 * Takes a document off the published perspective. The published `data` stays, so its unique values stay reserved,
 * and a missing draft becomes a copy of it. `by`: the user id, `null` for server code.
 */
export async function unpublishDoc(db: Db, collection: string, id: string, by: string | null) {
  await db
    .updateTable("cms_documents")
    .set({
      published_at: null,
      draft: sql`COALESCE(draft, data)`,
      updated_at: Date.now(),
      updated_by: by,
    })
    .where("collection", "=", collection)
    .where("id", "=", id)
    .execute();
}

/** Takes a global off the published perspective, like {@link unpublishDoc}. */
export async function unpublishGlobal(db: Db, name: string) {
  await db
    .updateTable("cms_globals")
    .set({ published_at: null, draft: sql`COALESCE(draft, data)`, updated_at: Date.now() })
    .where("name", "=", name)
    .execute();
}
