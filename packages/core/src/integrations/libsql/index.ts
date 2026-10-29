import type { Config } from "@libsql/client";
import { libsqlDialect } from "../../db/adapters/libsql.ts";
import type { DatabaseOptions } from "../../db/create-db.ts";

/**
 * The `database` of a CMS on libsql: a SQLite file, `:memory:` or Turso. The client opens on the first query.
 * @param config A URL (`file:cms.db`, `:memory:`, `libsql://…`), or the options of the client, such as `authToken`.
 * @example
 * export default defineCms({ database: libsql("file:/absolute/path/cms.db"), ... })
 */
export function libsql(config: string | Config): DatabaseOptions {
  return { dialect: libsqlDialect(typeof config === "string" ? { url: config } : config) };
}
