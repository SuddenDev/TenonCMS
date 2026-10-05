import type { Kysely } from "kysely";
import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import type { Database } from "../../db/types.ts";

/** Filenames used in `folder`, by media documents and by uploads in progress. */
export async function namesIn(db: Kysely<Database>, folder: string) {
  // ponytail: loads every document of the folder. Add a SQL filter on filename if folders grow large.
  const docs = await findDocs(db, "media", { where: { folder } });
  const uploads = await db
    .selectFrom("cms_uploads")
    .select("filename")
    .where("folder", "=", folder)
    .execute();

  return [...docs.map((d) => String(d.filename)), ...uploads.map((u) => u.filename)];
}
