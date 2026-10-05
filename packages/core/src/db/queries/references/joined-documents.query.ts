import { type Db, dataOf, visible, rawRowColumns } from "../document-sql.ts";
import { type Row } from "../../types.ts";
import { sql } from "kysely";

/**
 * Documents of `collection` whose relation at `on` points to one of `ids`, newest first. Each row carries the id it
 * points to as `ref`; a document with a `many` relation returns one row per matching id.
 */
export async function joinedDocs(
  db: Db,
  collection: string,
  on: string,
  many: boolean | undefined,
  ids: string[],
  drafts = false,
) {
  const path = `$.${on}`;
  const list = JSON.stringify(ids);
  const data = sql.raw(dataOf(drafts, "d."));
  const where = sql`d.collection = ${collection} AND ${visible(drafts, "d.")}`;
  const query = many
    ? sql<
        Row & { ref: string }
      >`SELECT ${rawRowColumns(drafts, "d.")}, j.value AS ref FROM cms_documents d, json_each(${data}, ${path}) j
        WHERE ${where} AND j.value IN (SELECT value FROM json_each(${list}))
        ORDER BY d.created_at DESC, d.rowid DESC`
    : sql<
        Row & { ref: string }
      >`SELECT ${rawRowColumns(drafts, "d.")}, json_extract(${data}, ${path}) AS ref FROM cms_documents d
        WHERE ${where} AND json_extract(${data}, ${path}) IN (SELECT value FROM json_each(${list}))
        ORDER BY d.created_at DESC, d.rowid DESC`;
  return (await query.execute(db)).rows;
}
