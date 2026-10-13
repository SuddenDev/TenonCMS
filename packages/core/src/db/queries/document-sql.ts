import { type Database, type Row } from "../types.ts";
import type { Each, Step } from "../../schema/traversal/relation-paths.ts";
import { type Kysely, type RawBuilder, type SelectQueryBuilder, sql } from "kysely";

export type Db = Kysely<Database>;
export type DocData = Record<string, any>;

/**
 * How a read treats the locale rows of a localized collection or global. Unlocalized reads pass none.
 * The requested locale's row joins as `lr`, the default locale's as `ld`.
 */
export type Loc = {
  locale: string;
  defaultLocale: string;
  /** Whether a missing value or locale reads as the default locale's. */
  fallback: boolean;
  /** The top-level keys held by locale rows. */
  keys: readonly string[];
  /** Every configured locale, in order. */
  locales: readonly string[];
};

/** The locale table of documents or globals, with the column that holds the owner's key. */
export type LocaleOwner = {
  table: "cms_document_locales" | "cms_global_locales";
  key: "document_id" | "name";
};
export const DOCUMENT_LOCALES: LocaleOwner = { table: "cms_document_locales", key: "document_id" };
export const GLOBAL_LOCALES: LocaleOwner = { table: "cms_global_locales", key: "name" };

// Reads run in a perspective. Published (`drafts` false): published rows only, data from `data`.
// Drafts: every row, data from `COALESCE(draft, data)`. `t` is a table alias with its dot.

/** The data column of a perspective, as raw SQL. */
export const dataOf = (drafts: boolean, t = "") =>
  drafts ? `COALESCE(${t}draft, ${t}data)` : `${t}data`;

/**
 * The condition for the rows a perspective sees. A localized entry is seen in the published perspective when the
 * requested locale is published, or with `fallback` the default locale.
 */
export const visible = (drafts: boolean, t = "", loc?: Loc) => {
  if (drafts) return sql.raw<boolean>("1");
  if (!loc) return sql.raw<boolean>(`${t}published_at IS NOT NULL`);
  return sql.raw<boolean>(
    loc.fallback
      ? "(lr.published_at IS NOT NULL OR ld.published_at IS NOT NULL)"
      : "lr.published_at IS NOT NULL",
  );
};

/**
 * The `ON` condition of a locale row join: `alias` is `lr` or `ld`, `owner` the key of the document or global that
 * the row belongs to. The published perspective joins published rows only.
 */
export const localeOn = (
  drafts: boolean,
  alias: "lr" | "ld",
  locale: string,
  { key }: LocaleOwner,
  owner: string,
) =>
  sql<boolean>`${sql.raw(`${alias}.${key} = ${owner}`)} AND ${sql.raw(`${alias}.locale`)} = ${locale}${sql.raw(
    drafts ? "" : ` AND ${alias}.published_at IS NOT NULL`,
  )}`;

/** Both locale row joins, for raw SQL. */
export const localeJoins = (drafts: boolean, loc: Loc, locales: LocaleOwner, owner: string) =>
  sql`LEFT JOIN ${sql.raw(locales.table)} lr ON ${localeOn(drafts, "lr", loc.locale, locales, owner)}
    LEFT JOIN ${sql.raw(locales.table)} ld ON ${localeOn(drafts, "ld", loc.defaultLocale, locales, owner)}`;

// The columns of the requested and the default locale row. `r_data` is `NULL` for a missing row.
const localeColumns = (drafts: boolean): Array<[string, string]> => [
  ["r_data", dataOf(drafts, "lr.")],
  ["d_data", dataOf(drafts, "ld.")],
  ["r_published_at", "lr.published_at"],
  ["r_has_draft", "lr.draft IS NOT NULL"],
  ["d_published_at", "ld.published_at"],
  ["d_has_draft", "ld.draft IS NOT NULL"],
];

// The locales of a document that have a row, as a JSON array. The published perspective counts published rows.
const localesColumn = (drafts: boolean, t: string): [string, string] => [
  "locales",
  `(SELECT json_group_array(locale) FROM cms_document_locales WHERE document_id = ${t}id${drafts ? "" : " AND published_at IS NOT NULL"})`,
];

// Whether the shared row has a pending draft that differs from its published data.
export const SHARED_DRAFT = (t: string) => `(${t}draft IS NOT NULL AND ${t}draft <> ${t}data)`;

// The columns of a `Row` of table alias `t`, as `[alias, SQL]` pairs.
const documentColumns = (drafts: boolean, t: string, loc?: Loc): Array<[string, string]> => [
  ["id", `${t}id`],
  ["created_at", `${t}created_at`],
  ["updated_at", `${t}updated_at`],
  ["published_at", `${t}published_at`],
  ["has_draft", `${t}draft IS NOT NULL`],
  ["data", dataOf(drafts, t)],
  ...(loc
    ? [
        ...localeColumns(drafts),
        localesColumn(drafts, t),
        ["shared_draft", SHARED_DRAFT(t)] as [string, string],
      ]
    : []),
];

/** The columns of a `Row`. */
export const rowColumns = (drafts: boolean) =>
  [
    "id",
    "created_at",
    "updated_at",
    "published_at",
    sql<number>`draft IS NOT NULL`.as("has_draft"),
    sql<string>`${sql.raw(dataOf(drafts))}`.as("data"),
  ] as const;

/** The columns of a `Row` as raw SQL, for the table alias `t`. A localized `loc` adds the locale columns. */
export const rawRowColumns = (drafts: boolean, t: string, loc?: Loc) =>
  sql.raw(
    documentColumns(drafts, t, loc)
      .map(([alias, expr]) => `${expr} AS ${alias}`)
      .join(", "),
  );

/** `id IN (...)`. The ids go in as one JSON parameter, so there is no variable limit. */
export const inIds = (ids: string[]) =>
  sql<boolean>`id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`;

/**
 * The JSON value at a top-level key or a dot path of the data. With `loc`, a localized key reads the requested
 * locale's value and, with `fallback`, the default locale's when that is missing: the value a read returns.
 * `t` is the alias of the document table, `cms_documents.` when joined with locale rows.
 */
export const jsonAt = (
  path: string,
  drafts = false,
  loc?: Loc,
  t = loc ? "cms_documents." : "",
) => {
  const at = `$.${path}`;
  if (!loc?.keys.includes(path.split(".")[0]))
    return sql`json_extract(${sql.raw(dataOf(drafts, t))}, ${at})`;
  const requested = sql`json_extract(${sql.raw(dataOf(drafts, "lr."))}, ${at})`;
  if (!loc.fallback) return requested;
  return sql`COALESCE(${requested}, json_extract(${sql.raw(dataOf(drafts, "ld."))}, ${at}))`;
};

/**
 * Whether the relation at `path` in the JSON column `source` holds `id`. Each {@link Each} step scans the items with
 * one nested `json_each`; a `many` relation is an array. JSON paths, block types and the id are parameters.
 */
export function holdsAt(
  source: string,
  path: Step[],
  many: boolean | undefined,
  id: string,
  depth = 0,
): RawBuilder<boolean> {
  const each = path.findIndex((s) => typeof s !== "string");
  const at = `$.${(each < 0 ? path : path.slice(0, each)).join(".")}`;
  const json = sql.ref(source);
  if (each < 0)
    return many
      ? sql<boolean>`EXISTS (SELECT 1 FROM json_each(${json}, ${at}) j WHERE j.value = ${id})`
      : sql<boolean>`json_extract(${json}, ${at}) = ${id}`;

  const item = `i${depth}`;
  const { blockType } = path[each] as Each;
  const block = blockType
    ? sql`json_extract(${sql.ref(`${item}.value`)}, ${"$.blockType"}) = ${blockType} AND `
    : sql``;
  const rest = holdsAt(`${item}.value`, path.slice(each + 1), many, id, depth + 1);
  return sql<boolean>`EXISTS (SELECT 1 FROM json_each(${json}, ${at}) ${sql.raw(item)} WHERE ${block}${rest})`;
}

/**
 * Selects the `Row`s of a collection that a perspective sees. A localized `loc` joins the locale rows, so the
 * columns of `cms_documents` MUST be qualified in conditions added to the query.
 */
export function selectDocs(
  db: Db,
  collection: string,
  drafts: boolean,
  loc?: Loc,
): SelectQueryBuilder<Database, "cms_documents", Row> {
  if (!loc)
    return db
      .selectFrom("cms_documents")
      .select(rowColumns(drafts))
      .where("collection", "=", collection)
      .where(visible(drafts));

  return db
    .selectFrom("cms_documents")
    .leftJoin("cms_document_locales as lr", (j) =>
      j.on(localeOn(drafts, "lr", loc.locale, DOCUMENT_LOCALES, "cms_documents.id")),
    )
    .leftJoin("cms_document_locales as ld", (j) =>
      j.on(localeOn(drafts, "ld", loc.defaultLocale, DOCUMENT_LOCALES, "cms_documents.id")),
    )
    .select(
      documentColumns(drafts, "cms_documents.", loc).map(([alias, expr]) =>
        sql.raw(expr).as(alias),
      ),
    )
    .where("collection", "=", collection)
    .where(visible(drafts, "", loc)) as unknown as SelectQueryBuilder<
    Database,
    "cms_documents",
    Row
  >;
}
