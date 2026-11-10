import {
  type DatabaseConnection,
  type Dialect,
  type Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  sql,
  type TableMetadata,
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

// workerd refuses to read the columns and indexes of its internal `_cf_KV` table, which exists once the object has
// set an alarm. Introspection MUST skip the `_cf_` tables. Kysely's introspector has its own query, replaced below.
// better-auth's index query is fixed by rewriting its text.
const AUTH_INDEX_QUERY = "WHERE tables.type = 'table'";
const hideInternalTables = (query: string) =>
  query.replace(
    AUTH_INDEX_QUERY,
    `${AUTH_INDEX_QUERY} AND tables.name NOT LIKE '!_cf!_%' ESCAPE '!'`,
  );

type ColumnRow = {
  table: string;
  kind: string;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

/** Lists tables and their columns like Kysely's SQLite introspector, without the `_cf_` tables. */
class DurableObjectIntrospector extends SqliteIntrospector {
  readonly #db: Kysely<any>;

  constructor(db: Kysely<any>) {
    super(db);
    this.#db = db;
  }

  override async getTables(): Promise<TableMetadata[]> {
    const { rows } = await sql<ColumnRow>`
      WITH tables AS (
        SELECT name, type FROM sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite!_%' ESCAPE '!'
          AND name NOT LIKE '!_cf!_%' ESCAPE '!'
      )
      SELECT tables.name AS "table", tables.type AS kind, p.name, p.type, p."notnull", p.dflt_value, p.pk
      FROM tables, pragma_table_info(tables.name) AS p
      ORDER BY tables.name, p.cid`.execute(this.#db);

    const tables = new Map<string, TableMetadata>();
    for (const row of rows) {
      const table = tables.get(row.table) ?? {
        name: row.table,
        isView: row.kind === "view",
        isForeign: false,
        columns: [],
      };
      table.columns.push({
        name: row.name,
        dataType: row.type,
        isNullable: !row.notnull,
        isAutoIncrementing: row.pk > 0 && row.type.toLowerCase() === "integer",
        hasDefaultValue: row.dflt_value !== null,
      });
      tables.set(row.table, table);
    }
    return [...tables.values()];
  }
}

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
    createIntrospector: (db) => new DurableObjectIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
    createDriver: () => ({
      async init() {},
      async acquireConnection() {
        const connection: Connection = {
          async executeQuery(query) {
            const params = query.parameters.map((p) => (typeof p === "boolean" ? Number(p) : p));
            // The cursor MUST be read before the next `await`: it has no snapshot across one.
            const cursor = storage.sql.exec(hideInternalTables(query.sql), ...params);
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
