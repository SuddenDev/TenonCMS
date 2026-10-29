import { Kysely, sql } from "kysely";
import { expect, it } from "vitest";
import { libsqlDialect } from "./libsql.ts";

it("rolls back an interactive transaction", async () => {
  const db = new Kysely<any>({ dialect: libsqlDialect({ url: ":memory:" }) });
  await sql`CREATE TABLE t (v TEXT)`.execute(db);
  const failed = db.transaction().execute(async (trx) => {
    await trx.insertInto("t").values({ v: "a" }).execute();
    expect(await trx.selectFrom("t").selectAll().execute()).toEqual([{ v: "a" }]);
    throw new Error("boom");
  });
  await expect(failed).rejects.toThrow("boom");
  expect(await db.selectFrom("t").selectAll().execute()).toEqual([]);
});
