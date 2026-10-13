import { sql } from "kysely";
import { type Db, type DocData, type LocaleOwner } from "../document-sql.ts";

/**
 * Publishes the data of one locale row. A pending draft stays, unless `clearDraft`. A missing row is created.
 * `owner` is the document id or the global name.
 */
export async function saveLocale(
  db: Db,
  locales: LocaleOwner,
  owner: string,
  locale: string,
  data: DocData,
  clearDraft = false,
) {
  const now = Date.now();
  const json = JSON.stringify(data);
  await sql`INSERT INTO ${sql.table(locales.table)} (${sql.id(locales.key)}, locale, data, draft, created_at, updated_at, published_at)
    VALUES (${owner}, ${locale}, ${json}, NULL, ${now}, ${now}, ${now})
    ON CONFLICT (${sql.id(locales.key)}, locale) DO UPDATE SET data = ${json}, updated_at = ${now}, published_at = ${now}${
      clearDraft ? sql`, draft = NULL` : sql``
    }`.execute(db);
}
