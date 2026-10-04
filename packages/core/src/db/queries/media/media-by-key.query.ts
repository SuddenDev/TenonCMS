import { type Db, columns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";
import { sql } from "kysely";

/** The media document stored at `key`. Literal SQL, so SQLite uses `cms_media_key_idx`. Media is always published. */
export const mediaKeyQuery = (db: Db, key: string) =>
  db
    .selectFrom("cms_documents")
    .select(columns(false))
    .where(sql<boolean>`collection = 'media' AND json_extract(data, '$.key') = ${key}`);

export async function mediaByKey(db: Db, key: string) {
  const row = await mediaKeyQuery(db, key).executeTakeFirst();
  return row && toDoc(row);
}
