import type { Client, Config, Transaction } from "@libsql/client";
import {
  type DatabaseConnection,
  type Dialect,
  type Driver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

type Connection = DatabaseConnection & { tx?: Transaction };

// SQLite runs DDL in a transaction. Kysely's `SqliteAdapter` says it does not, so its migrator refuses a transaction.
// A `write` transaction takes the database's write lock at `BEGIN`, so `migrate()` runs in one and instances that
// start together on one database migrate one after the other.
class LibsqlAdapter extends SqliteAdapter {
  override get supportsTransactionalDdl() {
    return true;
  }
}

/**
 * A Kysely dialect over our own `@libsql/client`, in the shape of `@libsql/kysely-libsql`.
 * That package pulls a second client and native binary. Transactions are interactive `write` transactions.
 * Each driver opens its own client, so each Kysely instance on `:memory:` gets its own database.
 * A remote URL opens the web client: the Node entry loads the native binary on import, which serverless builds may lack.
 */
export function libsqlDialect(config: Config): Dialect {
  return {
    createAdapter: () => new LibsqlAdapter(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
    createDriver: () => driver(config),
  };
}

function driver(config: Config): Driver {
  let client: Client;
  return {
    async init() {
      const remote = /^(libsql|https?|wss?):/.test(config.url);
      const { createClient } = remote
        ? await import("@libsql/client/web")
        : await import("@libsql/client");
      client = createClient(config);
    },
    async acquireConnection() {
      const connection: Connection = {
        async executeQuery(query) {
          const result = await (connection.tx ?? client).execute({
            sql: query.sql,
            args: query.parameters as any[],
          });
          return {
            rows: result.rows as any[],
            numAffectedRows: BigInt(result.rowsAffected),
            insertId: result.lastInsertRowid,
          };
        },
        streamQuery() {
          throw new Error("libsql dialect does not support streaming");
        },
      };
      return connection;
    },
    async beginTransaction(connection: Connection) {
      connection.tx = await client.transaction("write");
    },
    async commitTransaction(connection: Connection) {
      await connection.tx!.commit();
      connection.tx = undefined;
    },
    async rollbackTransaction(connection: Connection) {
      await connection.tx!.rollback();
      connection.tx = undefined;
    },
    async releaseConnection() {},
    async destroy() {
      client.close();
    },
  };
}
