import {
  type Db,
  type Loc,
  DOCUMENT_LOCALES,
  eachItem,
  inIds,
  jsonAt,
  localeJoins,
  rawRowColumns,
  visible,
} from "../document-sql.ts";
import { type Row } from "../../types.ts";
import { sql } from "kysely";

/**
 * Documents of `collection` whose relation at `on` points to one of `ids`, newest first. Each row carries the id it
 * points to as `ref`; a document with a `many` relation returns one row per matching id.
 * A localized `loc` follows the relation of the locale that a read returns.
 */
export async function joinedDocs(
  db: Db,
  collection: string,
  on: string,
  many: boolean | undefined,
  ids: string[],
  drafts = false,
  loc?: Loc,
) {
  const value = jsonAt(db, on, drafts, loc, "d.");
  const from = loc
    ? sql`cms_documents d ${localeJoins(drafts, loc, DOCUMENT_LOCALES, "d.id")}`
    : sql`cms_documents d`;
  const where = sql`d.collection = ${collection} AND ${visible(drafts, "d.", loc)}`;
  const query = many
    ? sql<
        Row & { ref: string }
      >`SELECT ${rawRowColumns(db, drafts, "d.", loc)}, j.value AS ref FROM ${from}, ${eachItem(db, value, "j")}
        WHERE ${where} AND ${inIds(db, ids, sql`j.value`)}
        ORDER BY d.created_at DESC, d.rowid DESC`
    : sql<
        Row & { ref: string }
      >`SELECT ${rawRowColumns(db, drafts, "d.", loc)}, ${value} AS ref FROM ${from}
        WHERE ${where} AND ${inIds(db, ids, value)}
        ORDER BY d.created_at DESC, d.rowid DESC`;
  return (await query.execute(db)).rows;
}
