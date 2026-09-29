import { type Kysely, sql } from "kysely";
import { type Database, type Row, toDoc } from "./index.ts";

type Db = Kysely<Database>;
type Doc = Record<string, any>;

/** `id IN (...)`. The ids go in as one JSON parameter, so there is no variable limit. */
const inIds = (ids: string[]) =>
  sql<boolean>`id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`;

/** The JSON value at a top-level key or a dot path of `data`. */
const json = (path: string) => sql`json_extract(data, ${`$.${path}`})`;

/** Whether the relation at `path` holds `id`. A `many` relation is an array. */
const holds = (path: string, many: boolean | undefined, id: string) =>
  many
    ? sql<boolean>`EXISTS (SELECT 1 FROM json_each(data, ${`$.${path}`}) WHERE value = ${id})`
    : sql<boolean>`${json(path)} = ${id}`;

const docs = (db: Db, collection: string) =>
  db.selectFrom("cms_documents").selectAll().where("collection", "=", collection);

/** The media document stored at `key`. Literal SQL, so SQLite uses `cms_media_key_idx`. */
export const mediaKeyQuery = (db: Db, key: string) =>
  db
    .selectFrom("cms_documents")
    .selectAll()
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
  { id, where = {}, limit }: { id?: string; where?: Record<string, unknown>; limit?: number },
) {
  let query = docs(db, collection);
  if (id !== undefined) query = query.where("id", "=", id);
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    query = query.where(
      value === null ? sql<boolean>`${json(key)} IS NULL` : sql<boolean>`${json(key)} = ${value}`,
    );
  }
  // `rowid` orders documents created in the same millisecond.
  query = query.orderBy("created_at", "desc").orderBy(sql`rowid`, "desc");
  if (limit) query = query.limit(limit);
  return (await query.execute()).map(toDoc);
}

export async function loadDoc(db: Db, collection: string, id: string) {
  const row = await docs(db, collection).where("id", "=", id).executeTakeFirst();
  return row && toDoc(row);
}

export async function byIds(db: Db, collection: string, ids: string[]) {
  if (!ids.length) return [];
  return (await docs(db, collection).where(inIds(ids)).execute()).map(toDoc);
}

/** The ids of `ids` that exist in `collection`. */
export async function existingIds(db: Db, collection: string, ids: string[]) {
  const rows = await db
    .selectFrom("cms_documents")
    .select("id")
    .where("collection", "=", collection)
    .where(inIds(ids))
    .execute();
  return rows.map((r) => r.id);
}

/** Whether another document of `collection` stores `value` under `key`. */
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
      })
      .returningAll()
      .executeTakeFirstOrThrow(),
  );
}

export async function updateDoc(db: Db, collection: string, id: string, data: Doc) {
  return toDoc(
    await db
      .updateTable("cms_documents")
      .set({ data: JSON.stringify(data), updated_at: Date.now() })
      .where("collection", "=", collection)
      .where("id", "=", id)
      .returningAll()
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

/** The stored data of a global, or `undefined` if it was never saved. */
export async function loadGlobal(db: Db, name: string) {
  const row = await db
    .selectFrom("cms_globals")
    .select("data")
    .where("name", "=", name)
    .executeTakeFirst();
  return row && (JSON.parse(row.data) as Doc);
}

export async function saveGlobal(db: Db, name: string, data: Doc) {
  const now = Date.now();
  const json = JSON.stringify(data);
  await db
    .insertInto("cms_globals")
    .values({ name, data: json, created_at: now, updated_at: now })
    .onConflict((oc) => oc.column("name").doUpdateSet({ data: json, updated_at: now }))
    .execute();
}

/** Documents of `collection` whose relation at `path` holds `id`, as `{ id, data }` with the raw JSON. */
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

/** The raw JSON of global `name` if its relation at `path` holds `id`. */
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
) {
  const path = `$.${on}`;
  const list = JSON.stringify(ids);
  const query = many
    ? sql<
        Row & { ref: string }
      >`SELECT d.*, j.value AS ref FROM cms_documents d, json_each(d.data, ${path}) j
        WHERE d.collection = ${collection} AND j.value IN (SELECT value FROM json_each(${list}))
        ORDER BY d.created_at DESC, d.rowid DESC`
    : sql<
        Row & { ref: string }
      >`SELECT d.*, json_extract(d.data, ${path}) AS ref FROM cms_documents d
        WHERE d.collection = ${collection} AND json_extract(d.data, ${path}) IN (SELECT value FROM json_each(${list}))
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
