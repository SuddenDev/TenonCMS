import pg from "pg";
import { expect, it } from "vitest";
import { postgres } from "./index.ts";

it("exposes its pool, so a host can attach it to its platform", async () => {
  const { pool } = postgres("postgres://localhost/cms");
  expect(pool).toBeInstanceOf(pg.Pool);
  const parse = (pool.options as pg.PoolConfig).types!.getTypeParser(pg.types.builtins.INT8);
  expect(parse("42")).toBe(42);
  await pool.end();
});
