import { type Db, type LocaleOwner, holdsAt } from "../document-sql.ts";
import type { Step } from "../../../schema/traversal/relation-paths.ts";
import { sql } from "kysely";

export type LocaleReference = {
  /** The document id, or the global name. */
  owner: string;
  locale: string;
  data: string;
  draft: string | null;
  inData: boolean;
  inDraft: boolean;
};

/**
 * Locale rows of `collection` (or the global `name`) whose relation at `path` holds `id` in the published data or in the
 * pending draft, with the raw JSON of both.
 */
export async function referencingLocales(
  db: Db,
  locales: LocaleOwner,
  name: string,
  path: Step[],
  many: boolean | undefined,
  id: string,
) {
  const holds = (column: "data" | "draft") => holdsAt(`l.${column}`, path, many, id);
  const scope =
    locales.key === "document_id"
      ? sql`JOIN cms_documents d ON d.id = l.document_id WHERE d.collection = ${name}`
      : sql`WHERE l.name = ${name}`;

  const { rows } = await sql<{
    owner: string;
    locale: string;
    data: string;
    draft: string | null;
    in_data: number;
    in_draft: number;
  }>`SELECT l.${sql.id(locales.key)} AS owner, l.locale, l.data, l.draft,
      ${holds("data")} AS in_data, ${holds("draft")} AS in_draft
    FROM ${sql.table(locales.table)} l ${scope}
    AND (${holds("data")} OR ${holds("draft")})`.execute(db);

  return rows.map((r): LocaleReference => ({
    ...r,
    inData: Boolean(r.in_data),
    inDraft: Boolean(r.in_draft),
  }));
}
