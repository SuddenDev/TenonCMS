import { Kysely, sql } from "kysely";
import { expect, it, vi } from "vitest";
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

// Serverless builds may lack the native binary, which the Node entry of `@libsql/client` loads on import.
it("opens a remote database without the native client", async () => {
  vi.doMock("@libsql/client", () => {
    throw new Error("loaded the native client");
  });
  const execute = vi.fn(async () => ({ rows: [{ n: 1 }], rowsAffected: 0 }));
  vi.doMock("@libsql/client/web", () => ({ createClient: () => ({ execute, close() {} }) }));
  try {
    const db = new Kysely<any>({ dialect: libsqlDialect({ url: "libsql://db.turso.io" }) });
    const { rows } = await sql`SELECT 1 AS n`.execute(db);
    expect(rows).toEqual([{ n: 1 }]);
  } finally {
    vi.doUnmock("@libsql/client");
    vi.doUnmock("@libsql/client/web");
  }
});
