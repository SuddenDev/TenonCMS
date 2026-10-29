import { type Db, isPostgres, rowColumns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";
import { sql } from "kysely";

/**
 * Selects the media document at `key`. Literal SQL that repeats the index expression of the dialect, so the database
 * uses `cms_media_key_idx`. Media is always published.
 */
export const mediaKeyQuery = (db: Db, key: string) =>
  db
    .selectFrom("cms_documents")
    .select(rowColumns(false))
    .where(
      isPostgres(db)
        ? sql<boolean>`collection = 'media' AND (data::jsonb ->> 'key') = ${key}`
        : sql<boolean>`collection = 'media' AND json_extract(data, '$.key') = ${key}`,
    );

/** The media document at `key`, or `undefined`. */
export async function mediaByKey(db: Db, key: string) {
  const row = await mediaKeyQuery(db, key).executeTakeFirst();
  return row && toDoc(row);
}
