import type { Db, Holds, LocaleOwner } from "../document-sql.ts";
import { sql } from "kysely";

export type LocaleReference = {
  /** The document id, or the global name. */
  owner: string;
  locale: string;
  data: string;
  draft: string | null;
  inData: boolean;
  inDraft: boolean;
  /** The shared row's published data, and its pending data (`draft`, else `data`). */
  shared: { data: string; pending: string };
};

/**
 * Locale rows of `collection` (or the global `name`) whose published data or pending draft `holds`, with the raw JSON
 * of both.
 */
export async function referencingLocales(db: Db, locales: LocaleOwner, name: string, inRow: Holds) {
  const holds = (column: "data" | "draft") => inRow(`l.${column}`);
  const scope =
    locales.key === "document_id"
      ? sql`JOIN cms_documents s ON s.id = l.document_id WHERE s.collection = ${name}`
      : sql`JOIN cms_globals s ON s.name = l.name WHERE l.name = ${name}`;

  const { rows } = await sql<{
    owner: string;
    locale: string;
    data: string;
    draft: string | null;
    in_data: number;
    in_draft: number;
    shared_data: string;
    shared_pending: string;
  }>`SELECT l.${sql.id(locales.key)} AS owner, l.locale, l.data, l.draft,
      s.data AS shared_data, COALESCE(s.draft, s.data) AS shared_pending,
      ${holds("data")} AS in_data, ${holds("draft")} AS in_draft
    FROM ${sql.table(locales.table)} l ${scope}
    AND (${holds("data")} OR ${holds("draft")})`.execute(db);

  return rows.map(({ shared_data, shared_pending, ...r }): LocaleReference => ({
    ...r,
    inData: Boolean(r.in_data),
    inDraft: Boolean(r.in_draft),
    shared: { data: shared_data, pending: shared_pending },
  }));
}
