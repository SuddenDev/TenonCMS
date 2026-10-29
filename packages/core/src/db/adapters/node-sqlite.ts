import { type Dialect, SqliteDialect } from "kysely";

/**
 * Kysely's `SqliteDialect` over `node:sqlite`, in the shape of `better-sqlite3`. The database opens on the first
 * query, one per driver, so each Kysely instance on `:memory:` gets its own. `SqliteAdapter` makes Kysely hand out
 * the one connection to one caller at a time, so a transaction holds it from `BEGIN` to `COMMIT`.
 */
export function nodeSqliteDialect(path: string): Dialect {
  return new SqliteDialect({
    async database() {
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(path);
      return {
        close: () => db.close(),
        prepare(query) {
          const statement = db.prepare(query);
          // Older Node versions cannot bind booleans.
          const bind = (params: ReadonlyArray<unknown>) =>
            params.map((p) => (typeof p === "boolean" ? Number(p) : p)) as never[];
          return {
            reader: statement.columns().length > 0,
            all: (params) => statement.all(...bind(params)),
            run: (params) => statement.run(...bind(params)),
            iterate: (params) => statement.iterate(...bind(params)),
          };
        },
      };
    },
  });
}
