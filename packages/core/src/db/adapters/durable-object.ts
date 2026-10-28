import {
  type DatabaseConnection,
  type Dialect,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

/** The part of a SQLite-backed Durable Object's `ctx.storage` that the dialect uses. */
export type DurableObjectStorage = {
  sql: {
    exec(
      query: string,
      ...bindings: unknown[]
    ): { toArray(): unknown[]; readonly rowsWritten: number };
  };
  transaction<T>(closure: () => Promise<T>): Promise<T>;
};

type Connection = DatabaseConnection & {
  transaction?: { done: Promise<unknown>; finish: PromiseWithResolvers<void> };
};

/**
 * A Kysely dialect over a SQLite-backed Durable Object's storage.
 *
 * Kysely opens a transaction with begin, commit and rollback calls. The object only offers
 * `storage.transaction(callback)`, so begin starts a callback that waits until commit or rollback settles it.
 * Every `sql.exec()` while the callback runs is part of the transaction, from any caller.
 *
 * Other callers MUST wait. workerd holds other events until the transaction ends, and `SqliteAdapter` makes Kysely
 * hand out one connection at a time, which holds callers of the same event.
 */
export function durableObjectDialect(storage: DurableObjectStorage): Dialect {
  return {
    createAdapter: () => new SqliteAdapter(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
    createDriver: () => ({
      async init() {},
      async acquireConnection() {
        const connection: Connection = {
          async executeQuery(query) {
            const params = query.parameters.map((p) => (typeof p === "boolean" ? Number(p) : p));
            // The cursor MUST be read before the next `await`: it has no snapshot across one.
            const cursor = storage.sql.exec(query.sql, ...params);
            const rows = cursor.toArray();
            return { rows: rows as any[], numAffectedRows: BigInt(cursor.rowsWritten) };
          },
          streamQuery() {
            throw new Error("Durable Object dialect does not support streaming");
          },
        };
        return connection;
      },
      async beginTransaction(connection: Connection) {
        const started = Promise.withResolvers<void>();
        const finish = Promise.withResolvers<void>();
        const done = storage.transaction(async () => {
          started.resolve();
          await finish.promise;
        });
        done.catch(started.reject);
        connection.transaction = { done, finish };
        await started.promise;
      },
      async commitTransaction(connection: Connection) {
        const { done, finish } = connection.transaction!;
        connection.transaction = undefined;
        finish.resolve();
        await done;
      },
      async rollbackTransaction(connection: Connection) {
        const { done, finish } = connection.transaction!;
        connection.transaction = undefined;
        finish.reject(new Error("rollback"));
        // The rejection is the rollback. Kysely rethrows the error that caused it.
        await done.catch(() => {});
      },
      async releaseConnection() {},
      async destroy() {},
    }),
  };
}
