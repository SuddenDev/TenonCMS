import { sql } from "kysely";
import { type Db, type LocaleOwner } from "../document-sql.ts";

/**
 * Drops the drafts of the locale rows of a document or global: rows that were never published are deleted, the
 * others lose their draft. `locale` limits it to one row.
 */
export async function discardLocaleDrafts(
  db: Db,
  locales: LocaleOwner,
  owner: string,
  locale?: string,
) {
  const where = sql`${sql.id(locales.key)} = ${owner}${locale === undefined ? sql`` : sql` AND locale = ${locale}`}`;
  await sql`DELETE FROM ${sql.table(locales.table)} WHERE ${where} AND published_at IS NULL`.execute(
    db,
  );
  await sql`UPDATE ${sql.table(locales.table)} SET draft = NULL WHERE ${where}`.execute(db);
}
