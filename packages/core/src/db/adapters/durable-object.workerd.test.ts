import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { Kysely, sql } from "kysely";
import { describe, expect, it } from "vitest";
import { durableObjectDialect } from "./durable-object.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `fn` inside a fresh object, on a Kysely instance over its storage with an empty table `t`. */
const inObject = (fn: (db: Kysely<any>) => Promise<void>) =>
  runInDurableObject(env.CMS.getByName(crypto.randomUUID()), async (_, state) => {
    const db = new Kysely<any>({ dialect: durableObjectDialect(state.storage) });
    await sql`CREATE TABLE t (v TEXT, n INTEGER, b INTEGER, data TEXT)`.execute(db);
    await fn(db);
  });

const values = (db: Kysely<any>) =>
  db
    .selectFrom("t")
    .select("v")
    .orderBy(sql`rowid`)
    .execute()
    .then((rows) => rows.map((r) => r.v));

describe("durable object dialect", () => {
  it("binds parameters and runs JSON functions", () =>
    inObject(async (db) => {
      const inserted = await db
        .insertInto("t")
        .values({ v: "a", n: 1, b: true, data: JSON.stringify({ tags: ["x", "y"] }) })
        .returning(["v", "b"])
        .execute();
      expect(inserted).toEqual([{ v: "a", b: 1 }]);
      await db.insertInto("t").values({ v: null, n: 2, b: false, data: null }).execute();

      const { rows } = await sql<{ tag: string }>`
        SELECT j.value AS tag FROM t, json_each(json_extract(t.data, '$.tags')) j
        WHERE json_extract(t.data, '$.tags[0]') = ${"x"}`.execute(db);
      expect(rows.map((r) => r.tag)).toEqual(["x", "y"]);

      const { numUpdatedRows } = await db
        .updateTable("t")
        .set({ n: 3 })
        .where("b", "=", 0)
        .executeTakeFirst();
      expect(numUpdatedRows).toBe(1n);
    }));

  it("commits a transaction", () =>
    inObject(async (db) => {
      await db.transaction().execute(async (trx) => {
        await trx.insertInto("t").values({ v: "a" }).execute();
      });
      expect(await values(db)).toEqual(["a"]);
    }));

  it("rolls back a transaction that throws", () =>
    inObject(async (db) => {
      const failed = db.transaction().execute(async (trx) => {
        await trx.insertInto("t").values({ v: "a" }).execute();
        expect(await values(trx)).toEqual(["a"]);
        throw new Error("boom");
      });
      await expect(failed).rejects.toThrow("boom");
      expect(await values(db)).toEqual([]);
    }));

  it("rolls back across non-storage awaits", () =>
    inObject(async (db) => {
      const failed = db.transaction().execute(async (trx) => {
        await trx.insertInto("t").values({ v: "a" }).execute();
        await wait(20);
        await env.CMS.getByName("other").fetch("http://x/_tenon/schema");
        await trx.insertInto("t").values({ v: "b" }).execute();
        await wait(20);
        throw new Error("boom");
      });
      await expect(failed).rejects.toThrow("boom");
      expect(await values(db)).toEqual([]);
    }));

  // workerd holds other events (timers, requests) until a storage transaction ends. Promise callbacks of the same
  // event still run, so code that continues right after a write inside the transaction needs the dialect's queue.
  it("runs one caller at a time, so a rollback keeps the other caller's write", () =>
    inObject(async (db) => {
      const inserted = Promise.withResolvers<void>();
      const first = db.transaction().execute(async (trx) => {
        await trx.insertInto("t").values({ v: "a1" }).execute();
        inserted.resolve();
        await wait(20);
        throw new Error("boom");
      });
      await inserted.promise;
      const second = db.transaction().execute(async (trx) => {
        await trx.insertInto("t").values({ v: "b" }).execute();
      });
      const results = await Promise.allSettled([first, second]);
      expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
      expect(await values(db)).toEqual(["b"]);
    }));

  it("keeps a plain read out of an open transaction", () =>
    inObject(async (db) => {
      const inserted = Promise.withResolvers<void>();
      const write = db.transaction().execute(async (trx) => {
        await trx.insertInto("t").values({ v: "a" }).execute();
        inserted.resolve();
        await wait(20);
        throw new Error("boom");
      });
      await inserted.promise;
      const read = values(db);
      await expect(write).rejects.toThrow("boom");
      expect(await read).toEqual([]);
    }));
});
