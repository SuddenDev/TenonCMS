import { type Loc } from "./queries/document-sql.ts";
import { mergeLocale } from "../content/reads/merge-locale.ts";
import { type LocaleColumns, type Row } from "./types.ts";

const iso = (time: number) => new Date(time).toISOString();

type Meta = Pick<Row, "data" | "updated_at" | "published_at" | "has_draft"> &
  Partial<LocaleColumns>;

// The document of one locale. `publishedAt` and `hasDraft` belong to the requested locale's row, or with `fallback`
// to the default locale's when the requested one is missing. `updatedAt` is the later of the shared row and the
// requested locale's row, so a write in another locale does not change it.
function localized(row: Meta, loc: Loc) {
  const parse = (data: string | null | undefined) => (data == null ? null : JSON.parse(data));
  const own = row.r_data != null || !loc.fallback ? "r" : "d";
  const merged = mergeLocale(
    loc.keys,
    JSON.parse(row.data),
    parse(row.r_data),
    loc.fallback ? parse(row.d_data) : null,
  );
  return {
    data: merged,
    updated_at: Math.max(row.updated_at, row.r_updated_at ?? 0),
    published_at: row[`${own}_published_at`] ?? null,
    has_draft: row[`${own}_has_draft`] ?? 0,
  };
}

/**
 * Parses the data of a row and adds `updatedAt`, `publishedAt` and `hasDraft`. A localized `loc` merges the locale
 * rows.
 */
export const withMeta = (row: Meta, loc?: Loc) => {
  const { data, updated_at, published_at, has_draft } = loc
    ? localized(row, loc)
    : {
        data: JSON.parse(row.data),
        updated_at: row.updated_at,
        published_at: row.published_at,
        has_draft: row.has_draft,
      };
  return {
    ...data,
    updatedAt: iso(updated_at),
    publishedAt: published_at == null ? null : iso(published_at),
    hasDraft: Boolean(has_draft),
  };
};

/**
 * `locale` and `locales` from a JSON array of the locales with a row, in the order of the configuration, and
 * `sharedDraft`.
 */
export const localeMeta = (
  loc: Loc,
  rows: string | null | undefined,
  sharedDraft?: number | boolean,
) => ({
  locale: loc.locale,
  locales: loc.locales.filter((l) => (JSON.parse(rows ?? "[]") as string[]).includes(l)),
  sharedDraft: Boolean(sharedDraft),
});

/**
 * Turns a row into a document with its id and every metadata field, `createdBy` and `updatedBy` included. A localized `loc` adds `locale`, `locales`
 * (the locales with a row in the order of the configuration) and `sharedDraft`.
 */
export const toDoc = (row: Row, loc?: Loc): Record<string, any> & { id: string } => ({
  ...withMeta(row, loc),
  ...(loc && localeMeta(loc, row.locales, row.shared_draft)),
  id: row.id,
  createdAt: iso(row.created_at),
  createdBy: row.created_by,
  updatedBy: row.updated_by,
});
