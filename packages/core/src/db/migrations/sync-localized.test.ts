import { consola } from "consola";
import { sql } from "kysely";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDb } from "../create-db.ts";
import { migrator } from "./cms.ts";
import { syncLocalized } from "./sync-localized.ts";

async function tmpDb() {
  const db = createDb(":memory:");
  const { error } = await migrator(db).migrateToLatest();
  if (error) throw error;
  return db;
}

type Db = Awaited<ReturnType<typeof tmpDb>>;

const doc = (db: Db, id: string, data: object, draft: object | null = null, publishedAt = 5) =>
  sql`INSERT INTO cms_documents (id, collection, data, draft, created_at, updated_at, published_at)
    VALUES (${id}, 'posts', ${JSON.stringify(data)}, ${draft && JSON.stringify(draft)}, 1, 2, ${publishedAt})`.execute(
    db,
  );

const row = (db: Db, id: string) =>
  sql<{
    data: string;
    draft: string | null;
  }>`SELECT data, draft FROM cms_documents WHERE id = ${id}`
    .execute(db)
    .then((r) => ({
      data: JSON.parse(r.rows[0]!.data),
      draft: JSON.parse(r.rows[0]!.draft ?? "null"),
    }));

const locale = (db: Db, id: string, loc: string) =>
  sql<{
    data: string;
    draft: string | null;
    published_at: number | null;
    created_at: number;
    updated_at: number;
  }>`SELECT * FROM cms_document_locales WHERE document_id = ${id} AND locale = ${loc}`
    .execute(db)
    .then((r) => {
      const x = r.rows[0];
      return x && { ...x, data: JSON.parse(x.data), draft: JSON.parse(x.draft ?? "null") };
    });

const putLocale = (db: Db, id: string, loc: string, data: object) =>
  sql`INSERT INTO cms_document_locales (document_id, locale, data, created_at, updated_at, published_at)
    VALUES (${id}, ${loc}, ${JSON.stringify(data)}, 1, 2, 5)`.execute(db);

let stderr: ReturnType<typeof vi.spyOn>;
let stdout: ReturnType<typeof vi.spyOn>;
const level = consola.level;
beforeEach(() => {
  consola.level = 3;
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  stderr.mockRestore();
  stdout.mockRestore();
  consola.level = level;
});
const logged = () =>
  [...stderr.mock.calls, ...stdout.mock.calls].map((c: unknown[]) => String(c[0])).join("");

it("records the first run without moving anything", async () => {
  const db = await tmpDb();
  await doc(db, "a", { title: "Hi" });
  await syncLocalized(db, { "collection:posts": ["title"] }, "en");
  expect(await row(db, "a")).toEqual({ data: { title: "Hi" }, draft: null });
  expect(await locale(db, "a", "en")).toBeUndefined();
  const state = await sql`SELECT kind, name, localized FROM cms_schema_state`.execute(db);
  expect(state.rows).toContainEqual({
    kind: "collection",
    name: "posts",
    localized: '["title"]',
  });
});

it("moves a shared field into the default locale row", async () => {
  const db = await tmpDb();
  await doc(db, "a", { title: "Hi", views: 1 }, null, 7);
  await syncLocalized(db, { "collection:posts": [] }, "en");
  await syncLocalized(db, { "collection:posts": ["title"] }, "en");
  expect((await row(db, "a")).data).toEqual({ views: 1 });
  const en = await locale(db, "a", "en");
  expect(en).toMatchObject({
    data: { title: "Hi" },
    published_at: 7,
    created_at: 1,
    updated_at: 2,
  });
  expect(logged()).toContain("moved posts.title to locale rows (1 documents)");
});

it("moves the draft too", async () => {
  const db = await tmpDb();
  await doc(db, "a", { title: "Hi" }, { title: "Draft" });
  await syncLocalized(db, { "collection:posts": [] }, "en");
  await syncLocalized(db, { "collection:posts": ["title"] }, "en");
  expect(await row(db, "a")).toEqual({ data: {}, draft: {} });
  const en = await locale(db, "a", "en");
  expect(en!.data).toEqual({ title: "Hi" });
  expect(en!.draft).toEqual({ title: "Draft" });
});

it("moves the default locale back and keeps other locales", async () => {
  const db = await tmpDb();
  await doc(db, "a", { views: 1 });
  await putLocale(db, "a", "en", { title: "Hi" });
  await putLocale(db, "a", "de", { title: "Hallo" });
  await sql`INSERT INTO cms_schema_state (kind, name, localized) VALUES ('collection', 'posts', '["title"]'), ('meta', 'defaultLocale', '"en"')`.execute(
    db,
  );
  await syncLocalized(db, { "collection:posts": [] }, "en");
  expect((await row(db, "a")).data).toEqual({ views: 1, title: "Hi" });
  expect((await locale(db, "a", "en"))!.data).toEqual({});
  expect((await locale(db, "a", "de"))!.data).toEqual({ title: "Hallo" });
  expect(logged()).toContain("moved posts.title to shared data (1 documents)");

  await syncLocalized(db, { "collection:posts": ["title"] }, "en");
  expect((await row(db, "a")).data).toEqual({ views: 1 });
  expect((await locale(db, "a", "en"))!.data).toEqual({ title: "Hi" });
  expect((await locale(db, "a", "de"))!.data).toEqual({ title: "Hallo" });
});

it("moves a draft back into the shared draft", async () => {
  const db = await tmpDb();
  await doc(db, "a", { views: 1 });
  await sql`INSERT INTO cms_document_locales (document_id, locale, data, draft, created_at, updated_at, published_at)
    VALUES ('a', 'en', '{"title":"Hi"}', '{"title":"Draft"}', 1, 2, 5)`.execute(db);
  await sql`INSERT INTO cms_schema_state (kind, name, localized) VALUES ('collection', 'posts', '["title"]'), ('meta', 'defaultLocale', '"en"')`.execute(
    db,
  );
  await syncLocalized(db, { "collection:posts": null }, "en");
  expect(await row(db, "a")).toEqual({
    data: { views: 1, title: "Hi" },
    draft: { views: 1, title: "Draft" },
  });
});

it("turns a whole collection on and off", async () => {
  const db = await tmpDb();
  await doc(db, "a", { title: "Hi", body: "Text" });
  await syncLocalized(db, { "collection:posts": null }, "en");
  await syncLocalized(db, { "collection:posts": ["title", "body"] }, "en");
  expect((await row(db, "a")).data).toEqual({});
  expect((await locale(db, "a", "en"))!.data).toEqual({ title: "Hi", body: "Text" });
  await syncLocalized(db, { "collection:posts": null }, "en");
  expect((await row(db, "a")).data).toEqual({ title: "Hi", body: "Text" });
});

it("moves global fields", async () => {
  const db = await tmpDb();
  await sql`INSERT INTO cms_globals (name, data, created_at, updated_at, published_at)
    VALUES ('site', '{"name":"Acme"}', 1, 2, 9)`.execute(db);
  await syncLocalized(db, { "global:site": null }, "en");
  await syncLocalized(db, { "global:site": ["name"] }, "en");
  const g = await sql`SELECT data FROM cms_globals`.execute(db);
  expect(g.rows).toEqual([{ data: "{}" }]);
  const l = await sql`SELECT locale, data, published_at FROM cms_global_locales`.execute(db);
  expect(l.rows).toEqual([{ locale: "en", data: '{"name":"Acme"}', published_at: 9 }]);
});

it("warns with a count when the default locale changes", async () => {
  const db = await tmpDb();
  await doc(db, "a", {});
  await doc(db, "b", {});
  await doc(db, "c", {});
  await putLocale(db, "a", "en", { title: "A" });
  await putLocale(db, "b", "en", { title: "B" });
  await putLocale(db, "b", "de", { title: "B" });
  await putLocale(db, "c", "en", { title: "C" });
  await syncLocalized(db, { "collection:posts": ["title"] }, "en");
  expect(logged()).not.toContain("defaultLocale");
  await syncLocalized(db, { "collection:posts": ["title"] }, "de");
  expect(logged()).toContain(
    'defaultLocale changed from "en" to "de": 2 documents have no "de" row',
  );
  stderr.mockClear();
  stdout.mockClear();
  await syncLocalized(db, { "collection:posts": ["title"] }, "de");
  expect(logged()).not.toContain("defaultLocale");
});
