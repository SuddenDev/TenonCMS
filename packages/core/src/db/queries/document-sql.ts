import { type Database } from "../types.ts";
import { type Kysely, sql } from "kysely";

export type Db = Kysely<Database>;
export type DocData = Record<string, any>;

// Reads run in a perspective. Published (`drafts` false): published rows only, data from `data`.
// Drafts: every row, data from `COALESCE(draft, data)`. `t` is a table alias with its dot.

/** The data column of a perspective, as raw SQL. */
export const dataOf = (drafts: boolean, t = "") =>
  drafts ? `COALESCE(${t}draft, ${t}data)` : `${t}data`;

/** The condition for the rows a perspective sees. */
export const visible = (drafts: boolean, t = "") =>
  sql.raw<boolean>(drafts ? "1" : `${t}published_at IS NOT NULL`);

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

/** The columns of a `Row` as raw SQL, for the table alias `t`. */
export const rawRowColumns = (drafts: boolean, t: string) =>
  sql.raw(
    `${t}id, ${t}created_at, ${t}updated_at, ${t}published_at, ${t}draft IS NOT NULL AS has_draft, ${dataOf(drafts, t)} AS data`,
  );

/** `id IN (...)`. The ids go in as one JSON parameter, so there is no variable limit. */
export const inIds = (ids: string[]) =>
  sql<boolean>`id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`;

/** The JSON value at a top-level key or a dot path of the data. */
export const jsonAt = (path: string, drafts = false) =>
  sql`json_extract(${sql.raw(dataOf(drafts))}, ${`$.${path}`})`;

/** Whether the relation at `path` holds `id`. A `many` relation is an array. */
export const holds = (path: string, many: boolean | undefined, id: string) =>
  many
    ? sql<boolean>`EXISTS (SELECT 1 FROM json_each(data, ${`$.${path}`}) WHERE value = ${id})`
    : sql<boolean>`${jsonAt(path)} = ${id}`;

/** Selects the `Row`s of a collection that a perspective sees. */
export const selectDocs = (db: Db, collection: string, drafts: boolean) =>
  db
    .selectFrom("cms_documents")
    .select(rowColumns(drafts))
    .where("collection", "=", collection)
    .where(visible(drafts));
