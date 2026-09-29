import { createClient } from "@libsql/client";
import { CompiledQuery, Kysely, sql } from "kysely";
import { expect, it } from "vitest";
import { insertDoc, mediaByKey, mediaKeyQuery } from "./documents.ts";
import { createDb, libsqlDialect, migrate } from "./index.ts";

it("rolls back an interactive transaction", async () => {
  const db = new Kysely<any>({ dialect: libsqlDialect(createClient({ url: ":memory:" })) });
  await sql`CREATE TABLE t (v TEXT)`.execute(db);
  const failed = db.transaction().execute(async (trx) => {
    await trx.insertInto("t").values({ v: "a" }).execute();
    expect(await trx.selectFrom("t").selectAll().execute()).toEqual([{ v: "a" }]);
    throw new Error("boom");
  });
  await expect(failed).rejects.toThrow("boom");
  expect(await db.selectFrom("t").selectAll().execute()).toEqual([]);
});

it("runs CMS migrations once", async () => {
  const db = createDb(":memory:");
  const auth = { database: { db, type: "sqlite" as const } };
  await migrate(db, auth);
  await migrate(db, auth);
  const { rows } = await sql<{ name: string }>`SELECT name FROM sqlite_master`.execute(db);
  expect(rows.map((r) => r.name)).toEqual(
    expect.arrayContaining([
      "cms_documents",
      "cms_globals",
      "cms_documents_collection_idx",
      "cms_kysely_migration",
      "cms_uploads",
      "cms_media_key_idx",
    ]),
  );
});

it("keeps media keys unique and finds them through the index", async () => {
  const db = createDb(":memory:");
  await migrate(db, { database: { db, type: "sqlite" } });
  const file = { key: "a/x.png", filename: "x.png" };
  const doc = await insertDoc(db, "media", file);
  await expect(insertDoc(db, "media", file)).rejects.toThrow(/UNIQUE/);
  await insertDoc(db, "posts", file);
  expect(await mediaByKey(db, "a/x.png")).toEqual(doc);
  expect(await mediaByKey(db, "a/y.png")).toBeUndefined();
  const query = mediaKeyQuery(db, "a/x.png").compile();
  const plan = await db.executeQuery<{ detail: string }>(
    CompiledQuery.raw(`EXPLAIN QUERY PLAN ${query.sql}`, [...query.parameters]),
  );
  expect(plan.rows.map((r) => r.detail).join()).toContain("cms_media_key_idx");
});
