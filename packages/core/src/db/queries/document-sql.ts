import { type Database, type Row } from "../types.ts";
import type { Each, Step } from "../../schema/traversal/relation-paths.ts";
import type { Field } from "../../schema/index.ts";
import {
  type Kysely,
  PostgresAdapter,
  type RawBuilder,
  type SelectQueryBuilder,
  sql,
} from "kysely";

export type Db = Kysely<Database>;

/** Whether `db` (or a transaction of it) runs on Postgres or PGlite. Otherwise it runs on SQLite. */
export const isPostgres = (db: Kysely<any>) => db.getExecutor().adapter instanceof PostgresAdapter;
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
  /** The localized top-level fields that hold lists, by key. Their structure MAY be shared, see `mergeLocale()`. */
  structure: Record<string, Field>;
  /** Whether a document without its own `syncStructure` uses one structure in every locale. */
  syncDefault: boolean;
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
  if (drafts) return sql.raw<boolean>("TRUE");
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
  ["r_updated_at", "lr.updated_at"],
  ["r_published_at", "lr.published_at"],
  ["r_has_draft", "lr.draft IS NOT NULL"],
  ["d_published_at", "ld.published_at"],
  ["d_has_draft", "ld.draft IS NOT NULL"],
];

/** A JSON array of `column` over the rows of a subquery, as raw SQL. Postgres gives `NULL` without rows. */
export const jsonArrayOf = (pg: boolean, column: string) =>
  pg ? `COALESCE(json_agg(${column})::text, '[]')` : `json_group_array(${column})`;

// The locales of a document that have a row, as a JSON array. The published perspective counts published rows.
const localesColumn = (pg: boolean, drafts: boolean, t: string): [string, string] => [
  "locales",
  `(SELECT ${jsonArrayOf(pg, "locale")} FROM cms_document_locales WHERE document_id = ${t}id${drafts ? "" : " AND published_at IS NOT NULL"})`,
];

// Whether the shared row has a pending draft that differs from its published data.
export const SHARED_DRAFT = (t: string) => `(${t}draft IS NOT NULL AND ${t}draft <> ${t}data)`;

// The columns of a `Row` of table alias `t`, as `[alias, SQL]` pairs.
const documentColumns = (
  pg: boolean,
  drafts: boolean,
  t: string,
  loc?: Loc,
): Array<[string, string]> => [
  ["id", `${t}id`],
  ["created_at", `${t}created_at`],
  ["updated_at", `${t}updated_at`],
  ["published_at", `${t}published_at`],
  ["created_by", `${t}created_by`],
  ["updated_by", `${t}updated_by`],
  ["has_draft", `${t}draft IS NOT NULL`],
  ["data", dataOf(drafts, t)],
  ...(loc
    ? [
        ...localeColumns(drafts),
        localesColumn(pg, drafts, t),
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
    "created_by",
    "updated_by",
    sql<number>`draft IS NOT NULL`.as("has_draft"),
    sql<string>`${sql.raw(dataOf(drafts))}`.as("data"),
  ] as const;

/** The columns of a `Row` as raw SQL, for the table alias `t`. A localized `loc` adds the locale columns. */
export const rawRowColumns = (db: Db, drafts: boolean, t: string, loc?: Loc) =>
  sql.raw(
    documentColumns(isPostgres(db), drafts, t, loc)
      .map(([alias, expr]) => `${expr} AS ${alias}`)
      .join(", "),
  );

/**
 * `value IN (...)`, `id` by default. The ids go in as one parameter (a JSON array on SQLite, an array on Postgres), so
 * there is no variable limit.
 */
export const inIds = (db: Db, ids: string[], value: RawBuilder<unknown> = sql.ref("id")) =>
  isPostgres(db)
    ? sql<boolean>`${value} = ANY(${ids})`
    : sql<boolean>`${value} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`;

/**
 * The value at the dot path `path` of the JSON in `json`. SQLite returns the SQL value of a scalar and JSON text of an
 * object or array; Postgres returns text.
 */
const extract = (pg: boolean, json: RawBuilder<unknown>, path: string) =>
  pg ? sql`(${json})::jsonb #>> ${path.split(".")}` : sql`json_extract(${json}, ${`$.${path}`})`;

/** The items of the JSON array `json` as rows of `alias` with the column `value`, for a `FROM` clause. */
export const eachItem = (db: Db, json: RawBuilder<unknown>, alias: string) =>
  isPostgres(db)
    ? sql`jsonb_array_elements_text(${arrayOrNull(sql`(${json})::jsonb`)}) ${sql.raw(alias)}`
    : sql`json_each(${json}) ${sql.raw(alias)}`;

// A jsonb value when it is an array, else `NULL`, so a scalar yields no items instead of an error.
const arrayOrNull = (json: RawBuilder<unknown>) =>
  sql`CASE jsonb_typeof(${json}) WHEN 'array' THEN ${json} END`;

/**
 * The JSON value at a top-level key or a dot path of the data. With `loc`, a localized key reads the requested
 * locale's value and, with `fallback`, the default locale's when that is missing: the value a read returns.
 * `t` is the alias of the document table, `cms_documents.` when joined with locale rows.
 */
export const jsonAt = (
  db: Db,
  path: string,
  drafts = false,
  loc?: Loc,
  t = loc ? "cms_documents." : "",
) => {
  const pg = isPostgres(db);
  if (!loc?.keys.includes(path.split(".")[0])) return extract(pg, sql.raw(dataOf(drafts, t)), path);
  const requested = extract(pg, sql.raw(dataOf(drafts, "lr.")), path);
  if (!loc.fallback) return requested;
  return sql`COALESCE(${requested}, ${extract(pg, sql.raw(dataOf(drafts, "ld.")), path)})`;
};

/** Whether the text `value` contains `query`, ignoring case. */
export const containsText = (db: Db, value: RawBuilder<unknown>, query: string) =>
  isPostgres(db)
    ? sql<boolean>`strpos(lower(CAST(${value} AS TEXT)), lower(${query})) > 0`
    : sql<boolean>`instr(lower(CAST(${value} AS TEXT)), lower(${query})) > 0`;

// The columns of the meta keys a filter MAY name.
const AUTHOR_COLUMNS: Record<string, string> = {
  createdBy: "cms_documents.created_by",
  updatedBy: "cms_documents.updated_by",
};

/**
 * The equality filter `<key> = value` on a top-level key of the data, or on `createdBy` / `updatedBy`. `null` means
 * `IS NULL`. The key MUST be checked against the schema first; `drafts` and `loc` work as in {@link jsonAt}.
 * Postgres compares text, so `value` arrives as text: `5` matches `5`, `true` matches `true`.
 * @returns The condition.
 */
export function equals(db: Db, key: string, value: unknown, drafts = false, loc?: Loc) {
  const field = Object.hasOwn(AUTHOR_COLUMNS, key)
    ? sql.ref(AUTHOR_COLUMNS[key])
    : jsonAt(db, key, drafts, loc);
  return value === null ? sql<boolean>`${field} IS NULL` : sql<boolean>`${field} = ${value}`;
}

/** A condition on the JSON column `column`, which a reference scan passes to its queries. */
export type Holds = (column: string) => RawBuilder<boolean>;

/**
 * Whether the relation at `path` in the JSON column `source` holds `id`. Each {@link Each} step scans the items with
 * one nested `json_each` (`jsonb_array_elements` on Postgres); a `many` relation is an array. JSON paths, block types
 * and the id are parameters.
 */
export function holdsAt(
  db: Db,
  source: string,
  path: Step[],
  many: boolean | undefined,
  id: string,
  depth = 0,
): RawBuilder<boolean> {
  const pg = isPostgres(db);
  const each = path.findIndex((s) => typeof s !== "string");
  const keys = (each < 0 ? path : path.slice(0, each)) as string[];
  const json = sql.ref(source);
  if (each < 0) {
    if (!many) return sql<boolean>`${extract(pg, json, keys.join("."))} = ${id}`;
    const items = pg
      ? sql`jsonb_array_elements_text(${arrayOrNull(sql`(${json})::jsonb #> ${keys}`)}) j`
      : sql`json_each(${json}, ${`$.${keys.join(".")}`}) j`;
    return sql<boolean>`EXISTS (SELECT 1 FROM ${items} WHERE j.value = ${id})`;
  }

  const item = `i${depth}`;
  const items = pg
    ? sql`jsonb_array_elements(${arrayOrNull(sql`(${json})::jsonb #> ${keys}`)}) ${sql.raw(item)}`
    : sql`json_each(${json}, ${`$.${keys.join(".")}`}) ${sql.raw(item)}`;
  const { blockType } = path[each] as Each;
  const block = blockType
    ? sql`${extract(pg, sql.ref(`${item}.value`), "blockType")} = ${blockType} AND `
    : sql``;
  const rest = holdsAt(db, `${item}.value`, path.slice(each + 1), many, id, depth + 1);
  return sql<boolean>`EXISTS (SELECT 1 FROM ${items} WHERE ${block}${rest})`;
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
      documentColumns(isPostgres(db), drafts, "cms_documents.", loc).map(([alias, expr]) =>
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
