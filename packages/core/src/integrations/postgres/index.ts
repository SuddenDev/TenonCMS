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
 * @returns The options, and `pool` for a platform that manages idle clients, such as `attachDatabasePool()` on Vercel.
 * @example
 * export default defineCms({ database: postgres(process.env.DATABASE_URL!), ... })
 */
export function postgres(config: string | pg.PoolConfig): DatabaseOptions & { pool: pg.Pool } {
  const string = typeof config !== "object" || !config;
  const options = string ? { connectionString: config } : config;
  const pool = new pg.Pool({ ...options, types });
  // A config object MAY rely on the `PG*` environment variables, so only a missing string counts.
  const problems = string && !config ? ["the connection string is missing"] : [];
  return { dialect: new PostgresDialect({ pool }), pool, problems };
}
