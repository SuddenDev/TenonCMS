import { sql } from "kysely";
import { type Db, type LocaleOwner } from "../document-sql.ts";

/**
 * Takes one locale row off the published perspective. Its `data` stays and a missing draft becomes a copy of it.
 * `owner` is the document id or the global name.
 */
export async function unpublishLocale(db: Db, locales: LocaleOwner, owner: string, locale: string) {
  await sql`UPDATE ${sql.table(locales.table)}
    SET published_at = NULL, draft = COALESCE(draft, data), updated_at = ${Date.now()}
    WHERE ${sql.id(locales.key)} = ${owner} AND locale = ${locale}`.execute(db);
}
