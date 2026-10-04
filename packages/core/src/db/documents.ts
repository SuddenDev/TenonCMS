import { type Kysely, sql } from "kysely";
import { type Database, type Row, toDoc, withMeta } from "./index.ts";

type Db = Kysely<Database>;
type Doc = Record<string, any>;

// Reads run in a perspective. Published (`drafts` false): published rows only, data from `data`.
// Drafts: every row, data from `COALESCE(draft, data)`. `t` is a table alias with its dot.

/** The data column of a perspective, as raw SQL. */
const dataOf = (drafts: boolean, t = "") => (drafts ? `COALESCE(${t}draft, ${t}data)` : `${t}data`);

/** The rows a perspective sees. */
const seen = (drafts: boolean, t = "") =>
  sql.raw<boolean>(drafts ? "1" : `${t}published_at IS NOT NULL`);

/** The columns of a `Row`. */
const columns = (drafts: boolean) =>
  [
    "id",
    "created_at",
    "updated_at",
    "published_at",
    sql<number>`draft IS NOT NULL`.as("has_draft"),
    sql<string>`${sql.raw(dataOf(drafts))}`.as("data"),
  ] as const;

/** The columns of a `Row` as raw SQL, for the table alias `t`. */
const rawColumns = (drafts: boolean, t: string) =>
  sql.raw(
    `${t}id, ${t}created_at, ${t}updated_at, ${t}published_at, ${t}draft IS NOT NULL AS has_draft, ${dataOf(drafts, t)} AS data`,
  );

/** `id IN (...)`. The ids go in as one JSON parameter, so there is no variable limit. */
const inIds = (ids: string[]) =>
  sql<boolean>`id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`;

/** The JSON value at a top-level key or a dot path of the data. */
const json = (path: string, drafts = false) =>
  sql`json_extract(${sql.raw(dataOf(drafts))}, ${`$.${path}`})`;

/** Whether the relation at `path` holds `id`. A `many` relation is an array. */
const holds = (path: string, many: boolean | undefined, id: string) =>
  many
    ? sql<boolean>`EXISTS (SELECT 1 FROM json_each(data, ${`$.${path}`}) WHERE value = ${id})`
    : sql<boolean>`${json(path)} = ${id}`;

const docs = (db: Db, collection: string, drafts: boolean) =>
  db
    .selectFrom("cms_documents")
    .select(columns(drafts))
    .where("collection", "=", collection)
    .where(seen(drafts));

/** The media document stored at `key`. Literal SQL, so SQLite uses `cms_media_key_idx`. Media is always published. */
export const mediaKeyQuery = (db: Db, key: string) =>
  db
    .selectFrom("cms_documents")
    .select(columns(false))
    .where(sql<boolean>`collection = 'media' AND json_extract(data, '$.key') = ${key}`);

export async function mediaByKey(db: Db, key: string) {
  const row = await mediaKeyQuery(db, key).executeTakeFirst();
  return row && toDoc(row);
}

/**
 * Documents of a collection, newest first. `where` holds equality filters on top-level keys; `null` means `IS NULL`.
 * The keys MUST be checked against the schema before they get here.
 */
export async function findDocs(
  db: Db,
  collection: string,
  {
    id,
    where = {},
    limit,
    drafts = false,
  }: { id?: string; where?: Record<string, unknown>; limit?: number; drafts?: boolean },
) {
  let query = docs(db, collection, drafts);
  if (id !== undefined) query = query.where("id", "=", id);
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    const field = json(key, drafts);
    query = query.where(
      value === null ? sql<boolean>`${field} IS NULL` : sql<boolean>`${field} = ${value}`,
    );
  }
  // `rowid` orders documents created in the same millisecond.
  query = query.orderBy("created_at", "desc").orderBy(sql`rowid`, "desc");
  if (limit) query = query.limit(limit);
  return (await query.execute()).map(toDoc);
}

export async function loadDoc(db: Db, collection: string, id: string, drafts = false) {
  const row = await docs(db, collection, drafts).where("id", "=", id).executeTakeFirst();
  return row && toDoc(row);
}

export async function byIds(db: Db, collection: string, ids: string[], drafts = false) {
  if (!ids.length) return [];
  return (await docs(db, collection, drafts).where(inIds(ids)).execute()).map(toDoc);
}

/** The ids of `ids` that exist in `collection`. Any row counts, published or not. */
export async function existingIds(db: Db, collection: string, ids: string[]) {
  const rows = await db
    .selectFrom("cms_documents")
    .select("id")
    .where("collection", "=", collection)
    .where(inIds(ids))
    .execute();
  return rows.map((r) => r.id);
}

/** Whether another document of `collection` stores `value` under `key`. Scans published data only. */
export async function taken(
  db: Db,
  collection: string,
  key: string,
  value: unknown,
  exceptId?: string,
) {
  let query = db
    .selectFrom("cms_documents")
    .select("id")
    .where("collection", "=", collection)
    .where(sql<boolean>`${json(key)} = ${value}`);
  if (exceptId) query = query.where("id", "!=", exceptId);
  return Boolean(await query.executeTakeFirst());
}

/** Inserts a published document. */
export async function insertDoc(db: Db, collection: string, data: Doc) {
  const now = Date.now();
  return toDoc(
    await db
      .insertInto("cms_documents")
      .values({
        id: crypto.randomUUID(),
        collection,
        data: JSON.stringify(data),
        created_at: now,
        updated_at: now,
        published_at: now,
      })
      .returning(columns(false))
      .executeTakeFirstOrThrow(),
  );
}

/** Publishes `data`. A pending draft stays. */
export async function updateDoc(db: Db, collection: string, id: string, data: Doc) {
  const now = Date.now();
  return toDoc(
    await db
      .updateTable("cms_documents")
      .set({ data: JSON.stringify(data), updated_at: now, published_at: now })
      .where("collection", "=", collection)
      .where("id", "=", id)
      .returning(columns(false))
      .executeTakeFirstOrThrow(),
  );
}

export async function deleteDoc(db: Db, collection: string, id: string) {
  await db
    .deleteFrom("cms_documents")
    .where("collection", "=", collection)
    .where("id", "=", id)
    .execute();
}

/** The data of a global with `publishedAt` and `hasDraft`, or `undefined` if the perspective does not see it. */
export async function loadGlobal(db: Db, name: string, drafts = false) {
  const row = await db
    .selectFrom("cms_globals")
    .select(["published_at", sql<number>`draft IS NOT NULL`.as("has_draft")])
    .select(sql<string>`${sql.raw(dataOf(drafts))}`.as("data"))
    .where("name", "=", name)
    .where(seen(drafts))
    .executeTakeFirst();
  return row && (withMeta(row) as Doc);
}

/** Publishes the data of a global. A pending draft stays. */
export async function saveGlobal(db: Db, name: string, data: Doc) {
  const now = Date.now();
  const json = JSON.stringify(data);
  await db
    .insertInto("cms_globals")
    .values({ name, data: json, created_at: now, updated_at: now, published_at: now })
    .onConflict((oc) =>
      oc.column("name").doUpdateSet({ data: json, updated_at: now, published_at: now }),
    )
    .execute();
}

/** Documents of `collection` whose relation at `path` holds `id`, as `{ id, data }` with the raw JSON. Reads published data. */
export function referencingDocs(
  db: Db,
  collection: string,
  path: string,
  many: boolean | undefined,
  id: string,
) {
  return db
    .selectFrom("cms_documents")
    .select(["id", "data"])
    .where("collection", "=", collection)
    .where(holds(path, many, id))
    .execute();
}

/** The raw JSON of global `name` if its relation at `path` holds `id`. Reads published data. */
export async function referencingGlobal(
  db: Db,
  name: string,
  path: string,
  many: boolean | undefined,
  id: string,
) {
  const row = await db
    .selectFrom("cms_globals")
    .select("data")
    .where("name", "=", name)
    .where(holds(path, many, id))
    .executeTakeFirst();
  return row?.data;
}

/**
 * Documents of `collection` whose relation at `on` points to one of `ids`, newest first. Each row carries the id it
 * points to as `ref`; a document with a `many` relation returns one row per matching id.
 */
export async function joinedDocs(
  db: Db,
  collection: string,
  on: string,
  many: boolean | undefined,
  ids: string[],
  drafts = false,
) {
  const path = `$.${on}`;
  const list = JSON.stringify(ids);
  const data = sql.raw(dataOf(drafts, "d."));
  const where = sql`d.collection = ${collection} AND ${seen(drafts, "d.")}`;
  const query = many
    ? sql<
        Row & { ref: string }
      >`SELECT ${rawColumns(drafts, "d.")}, j.value AS ref FROM cms_documents d, json_each(${data}, ${path}) j
        WHERE ${where} AND j.value IN (SELECT value FROM json_each(${list}))
        ORDER BY d.created_at DESC, d.rowid DESC`
    : sql<
        Row & { ref: string }
      >`SELECT ${rawColumns(drafts, "d.")}, json_extract(${data}, ${path}) AS ref FROM cms_documents d
        WHERE ${where} AND json_extract(${data}, ${path}) IN (SELECT value FROM json_each(${list}))
        ORDER BY d.created_at DESC, d.rowid DESC`;
  return (await query.execute(db)).rows;
}

/** The distinct values of a top-level key in `collection`, e.g. the folders of `media`. */
export async function distinct(db: Db, collection: string, key: string) {
  const rows = await db
    .selectFrom("cms_documents")
    .select(sql<unknown>`DISTINCT ${json(key)}`.as("value"))
    .where("collection", "=", collection)
    .execute();
  return rows.map((r) => r.value);
}
