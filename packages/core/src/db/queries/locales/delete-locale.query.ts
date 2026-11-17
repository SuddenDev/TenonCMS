import { sql } from "kysely";
import { type LocaleOwner } from "../document-sql.ts";
import type { Db } from "../../types.ts";

/** Deletes one locale row of a document or global. `owner` is the document id or the global name. */
export async function deleteLocale(db: Db, locales: LocaleOwner, owner: string, locale: string) {
  await sql`DELETE FROM ${sql.table(locales.table)} WHERE ${sql.id(locales.key)} = ${owner} AND locale = ${locale}`.execute(
    db,
  );
}
