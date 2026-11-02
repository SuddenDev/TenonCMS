import { sql } from "kysely";
import { type Db, type DocData, type LocaleOwner } from "../document-sql.ts";

/** The published data and the pending draft of every locale row of a document or global, parsed. */
export async function loadLocaleRows(db: Db, locales: LocaleOwner, owner: string) {
  const { rows } = await sql<{ locale: string; data: string; draft: string | null }>`
    SELECT locale, data, draft FROM ${sql.table(locales.table)} WHERE ${sql.id(locales.key)} = ${owner}`.execute(
    db,
  );
  return rows.map((r) => ({
    locale: r.locale,
    data: JSON.parse(r.data) as DocData,
    draft: r.draft === null ? null : (JSON.parse(r.draft) as DocData),
  }));
}
