import pg from "pg";
import { PostgresDialect } from "kysely";
import type { DatabaseOptions } from "../../db/create-db.ts";

// Timestamps are milliseconds in `bigint` columns. pg would return them as strings.
const types = {
  getTypeParser: (oid: number, format?: "text" | "binary") =>
    oid === pg.types.builtins.INT8 ? Number : pg.types.getTypeParser(oid, format as "text"),
};

/**
 * The `database` of a CMS on a Postgres server, through a `pg` pool.
 * @param config A connection string, or the options of the pool.
 * @example
 * export default defineCms({ database: postgres(process.env.DATABASE_URL!), ... })
 */
export function postgres(config: string | pg.PoolConfig): DatabaseOptions {
  const options = typeof config === "string" ? { connectionString: config } : config;
  return { dialect: new PostgresDialect({ pool: new pg.Pool({ ...options, types }) }) };
}
