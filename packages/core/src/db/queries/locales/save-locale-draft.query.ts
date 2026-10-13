import { sql } from "kysely";
import { type Db, type DocData, type LocaleOwner } from "../document-sql.ts";

/**
 * Stores the draft of one locale row. The published data stays. A missing row is created unpublished.
 * `owner` is the document id or the global name.
 */
export async function saveLocaleDraft(
  db: Db,
  locales: LocaleOwner,
  owner: string,
  locale: string,
  draft: DocData,
) {
  const now = Date.now();
  const json = JSON.stringify(draft);
  await sql`INSERT INTO ${sql.table(locales.table)} (${sql.id(locales.key)}, locale, data, draft, created_at, updated_at, published_at)
    VALUES (${owner}, ${locale}, '{}', ${json}, ${now}, ${now}, NULL)
    ON CONFLICT (${sql.id(locales.key)}, locale) DO UPDATE SET draft = ${json}, updated_at = ${now}`.execute(
    db,
  );
}
