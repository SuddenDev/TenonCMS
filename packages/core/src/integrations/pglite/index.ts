import type { PGliteInterface } from "@electric-sql/pglite";
import type { DatabaseOptions } from "../../db/create-db.ts";
import { pgliteDialect } from "../../db/adapters/pglite.ts";

/**
 * The `database` of a CMS on PGlite: Postgres in WebAssembly, in memory or in a folder.
 * @example
 * export default defineCms({ database: pglite(new PGlite("./.data/cms")), ... })
 */
export const pglite = (client: PGliteInterface): DatabaseOptions => ({
  dialect: pgliteDialect(client),
});
