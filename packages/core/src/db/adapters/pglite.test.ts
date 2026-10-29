import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { expect, it } from "vitest";
import { pgliteDialect } from "./pglite.ts";

const open = async () => {
  const db = new Kysely<any>({ dialect: pgliteDialect(new PGlite()) });
  await sql`CREATE TABLE t (v text, n bigint)`.execute(db);
  return db;
};

it("reads bigint as a number and counts affected rows", async () => {
  const db = await open();
  await db.insertInto("t").values({ v: "a", n: 1_700_000_000_000 }).execute();
  expect(await db.selectFrom("t").selectAll().execute()).toEqual([
    { v: "a", n: 1_700_000_000_000 },
  ]);
  const { numAffectedRows } = await sql`UPDATE t SET v = 'b'`.execute(db);
  expect(numAffectedRows).toBe(1n);
});

it("rolls back a transaction", async () => {
  const db = await open();
  const failed = db.transaction().execute(async (trx) => {
    await trx.insertInto("t").values({ v: "a" }).execute();
    expect(await trx.selectFrom("t").select("v").execute()).toEqual([{ v: "a" }]);
    throw new Error("boom");
  });
  await expect(failed).rejects.toThrow("boom");
  expect(await db.selectFrom("t").selectAll().execute()).toEqual([]);
});

it("holds other callers until the transaction ends", async () => {
  const db = await open();
  const outside: string[][] = [];
  await db
    .transaction()
    .execute(async (trx) => {
      await trx.insertInto("t").values({ v: "a" }).execute();
      // Without a queue, this read would run inside the open transaction and see its row.
      void db
        .selectFrom("t")
        .select("v")
        .execute()
        .then((rows) => outside.push(rows.map((r) => r.v)));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(outside).toEqual([]);
      throw new Error("boom");
    })
    .catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(outside).toEqual([[]]);
});
