import {
  type Db,
  type Loc,
  DOCUMENT_LOCALES,
  jsonAt,
  localeJoins,
  visible,
} from "../document-sql.ts";
import { sql } from "kysely";

/**
 * Whether another document of `collection` stores `value` under `key`. Scans published data only.
 * A localized `key` compares the values that a read of the `loc` locale returns, so a document without a row in it
 * counts with the default locale's value.
 */
export async function valueTaken(
  db: Db,
  collection: string,
  key: string,
  value: unknown,
  exceptId?: string,
  loc?: Loc,
) {
  if (loc?.keys.includes(key)) {
    const l = { ...loc, fallback: true };
    const { rows } = await sql`SELECT 1 FROM cms_documents
      ${localeJoins(false, l, DOCUMENT_LOCALES, "cms_documents.id")}
      WHERE cms_documents.collection = ${collection} AND ${visible(false, "", l)}
      AND ${jsonAt(db, key, false, l)} = ${value}
      ${exceptId ? sql`AND cms_documents.id != ${exceptId}` : sql``} LIMIT 1`.execute(db);
    return rows.length > 0;
  }

  let query = db
    .selectFrom("cms_documents")
    .select("id")
    .where("collection", "=", collection)
    .where(sql<boolean>`${jsonAt(db, key)} = ${value}`);
  if (exceptId) query = query.where("id", "!=", exceptId);

  return Boolean(await query.executeTakeFirst());
}
