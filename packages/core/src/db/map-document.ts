import { type Loc } from "./queries/document-sql.ts";
import { mergeLocale } from "../content/reads/merge-locale.ts";
import { type LocaleColumns, type Row } from "./types.ts";

const iso = (time: number) => new Date(time).toISOString();

type Meta = Pick<Row, "data" | "published_at" | "has_draft"> & Partial<LocaleColumns>;

// The document of one locale. `publishedAt` and `hasDraft` belong to the requested locale's row, or with `fallback`
// to the default locale's when the requested one is missing.
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
    published_at: row[`${own}_published_at`] ?? null,
    has_draft: row[`${own}_has_draft`] ?? 0,
  };
}

/** Parses the data of a row and adds `publishedAt` and `hasDraft`. A localized `loc` merges the locale rows. */
export const withMeta = (row: Meta, loc?: Loc) => {
  const { data, published_at, has_draft } = loc
    ? localized(row, loc)
    : { data: JSON.parse(row.data), published_at: row.published_at, has_draft: row.has_draft };
  return {
    ...data,
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
 * Turns a row into a document with its id and every metadata field. A localized `loc` adds `locale`, `locales`
 * (the locales with a row in the order of the configuration) and `sharedDraft`.
 */
export const toDoc = (row: Row, loc?: Loc): Record<string, any> & { id: string } => ({
  ...withMeta(row, loc),
  ...(loc && localeMeta(loc, row.locales, row.shared_draft)),
  id: row.id,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});
