import { sql } from "kysely";
import { expect, it } from "vitest";
import { createDb } from "../../db/create-db.ts";
import { libsql } from "./index.ts";

it("opens one client per connection, so instances that share the options do not share `:memory:`", async () => {
  const database = libsql(":memory:");
  const [a, b] = [createDb(database), createDb(database)];
  await sql`CREATE TABLE t (v text)`.execute(a);
  await expect(sql`SELECT * FROM t`.execute(b)).rejects.toThrow(/no such table/);
});

it("takes the client's options", async () => {
  const db = createDb(libsql({ url: ":memory:" }));
  const { rows } = await sql<{ n: number }>`SELECT 1 AS n`.execute(db);
  expect(rows).toEqual([{ n: 1 }]);
});
