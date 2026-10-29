import type { PGliteInterface } from "@electric-sql/pglite";
import {
  type DatabaseConnection,
  type Dialect,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";

// Timestamps are milliseconds in `bigint` columns. PGlite would return them as `BigInt`.
const parsers = { 20: Number };

/**
 * A Kysely dialect over PGlite. PGlite has one connection, so the driver hands it to one caller at a time: a caller
 * waits until the previous one releases it, and a transaction holds it from `BEGIN` to `COMMIT` or `ROLLBACK`.
 * Code inside a transaction MUST use `trx`; a query on the outer `db` waits for the transaction and never runs.
 */
export function pgliteDialect(client: PGliteInterface): Dialect {
  let queue = Promise.resolve();
  const connection: DatabaseConnection = {
    async executeQuery(query) {
      const result = await client.query(query.sql, query.parameters as any[], { parsers });
      return {
        rows: result.rows as any[],
        numAffectedRows:
          result.affectedRows === undefined ? undefined : BigInt(result.affectedRows),
      };
    },
    streamQuery() {
      throw new Error("PGlite dialect does not support streaming");
    },
  };
  let release = () => {};

  return {
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createDriver: () => ({
      async init() {},
      async acquireConnection() {
        const previous = queue;
        const held = Promise.withResolvers<void>();
        queue = held.promise;
        await previous;
        release = held.resolve;
        return connection;
      },
      async beginTransaction() {
        await client.query("BEGIN");
      },
      async commitTransaction() {
        await client.query("COMMIT");
      },
      async rollbackTransaction() {
        await client.query("ROLLBACK");
      },
      async releaseConnection() {
        release();
      },
      async destroy() {
        await client.close();
      },
    }),
  };
}
