import { sql } from "kysely";
import { expect, it } from "vitest";
import { createDb } from "../../db/create-db.ts";
import { sqlite } from "./index.ts";

it("opens one database per connection, so instances that share the options do not share `:memory:`", async () => {
  const database = sqlite(":memory:");
  const [a, b] = [createDb(database), createDb(database)];
  await sql`CREATE TABLE t (v text)`.execute(a);
  await expect(sql`SELECT * FROM t`.execute(b)).rejects.toThrow(/no such table/);
});

it("returns rows from RETURNING and binds booleans", async () => {
  const db = createDb(sqlite(":memory:"));
  await sql`CREATE TABLE t (v integer)`.execute(db);
  const { rows } = await sql<{ v: number }>`INSERT INTO t VALUES (${true}) RETURNING v`.execute(db);
  expect(rows).toEqual([{ v: 1 }]);
});
