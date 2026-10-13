import { sql } from "kysely";
import { type Db, type LocaleOwner } from "../document-sql.ts";

/** Deletes every locale row of a document or global. */
export async function deleteLocales(db: Db, locales: LocaleOwner, owner: string) {
  await sql`DELETE FROM ${sql.table(locales.table)} WHERE ${sql.id(locales.key)} = ${owner}`.execute(
    db,
  );
}
