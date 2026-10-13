import { sql } from "kysely";
import { type Db, type LocaleOwner } from "../document-sql.ts";

/** Deletes one locale row of a document or global. `owner` is the document id or the global name. */
export async function deleteLocale(db: Db, locales: LocaleOwner, owner: string, locale: string) {
  await sql`DELETE FROM ${sql.table(locales.table)} WHERE ${sql.id(locales.key)} = ${owner} AND locale = ${locale}`.execute(
    db,
  );
}
