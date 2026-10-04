import { type Db, type Doc } from "../document-sql.ts";

/** Publishes the data of a global. A pending draft stays, unless `clearDraft`. */
export async function saveGlobal(db: Db, name: string, data: Doc, clearDraft = false) {
  const now = Date.now();
  const json = JSON.stringify(data);
  await db
    .insertInto("cms_globals")
    .values({ name, data: json, created_at: now, updated_at: now, published_at: now })
    .onConflict((oc) =>
      oc.column("name").doUpdateSet({
        data: json,
        updated_at: now,
        published_at: now,
        ...(clearDraft && { draft: null }),
      }),
    )
    .execute();
}
