import { nodeSqliteDialect } from "../../db/adapters/node-sqlite.ts";
import type { DatabaseOptions } from "../../db/create-db.ts";

/**
 * The `database` of a CMS on Node's built-in `node:sqlite` (Node 22.16 or later): a SQLite file or `:memory:`, with no
 * dependency. On older Node versions, use `libsql()`.
 * @param path A file path or `:memory:`.
 * @example
 * export default defineCms({ database: sqlite("./.data/cms.db"), ... })
 */
export const sqlite = (path: string): DatabaseOptions => ({
  dialect: nodeSqliteDialect(path),
  problems: path ? [] : ["the path is missing"],
});
