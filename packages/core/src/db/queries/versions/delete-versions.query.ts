import type { Db } from "../document-sql.ts";

/** Deletes every version of a document. */
export async function deleteVersions(db: Db, target: string, docId: string) {
  await db
    .deleteFrom("cms_versions")
    .where("target", "=", target)
    .where("doc_id", "=", docId)
    .execute();
}
