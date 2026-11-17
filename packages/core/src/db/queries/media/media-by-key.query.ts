import { inIds, rowColumns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";
import { sql } from "kysely";
import type { Db } from "../../types.ts";
import { isPostgres } from "../../create-db.ts";

/**
 * Selects the media document at `key`. Literal SQL that repeats the index expression of the dialect, so the database
 * uses `cms_media_key_idx`. Media is always published.
 */
export const mediaKeyQuery = (db: Db, key: string) =>
  db
    .selectFrom("cms_documents")
    .select(rowColumns("published"))
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

/** The id of the media document at each of `keys`, by key. Binds one parameter for any number of keys. */
export async function mediaIdsByKey(db: Db, keys: string[]) {
  if (!keys.length) return new Map<string, string>();
  const key = isPostgres(db) ? sql`(data::jsonb ->> 'key')` : sql`json_extract(data, '$.key')`;
  const rows = await db
    .selectFrom("cms_documents")
    .select(["id", sql<string>`${key}`.as("key")])
    .where(sql<boolean>`collection = 'media' AND ${inIds(db, keys, key)}`)
    .execute();
  return new Map(rows.map((r) => [r.key, r.id]));
}
