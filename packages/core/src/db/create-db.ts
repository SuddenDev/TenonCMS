import { type Database } from "./types.ts";
import { type Dialect, Kysely } from "kysely";

/**
 * Where the CMS stores its data: a Kysely dialect. `libsql()`, `postgres()`, `pglite()` and `durableObject()` build
 * one. A host's own dialect MUST keep transactions open across `await`, because hooks and nested writes run inside
 * them. A dialect with Kysely's `PostgresAdapter` runs the Postgres queries; any other runs the SQLite ones.
 */
export type DatabaseOptions = { dialect: Dialect };

/** Opens Kysely on the configured database. Nothing connects until the first query. */
export const createDb = (database: DatabaseOptions) =>
  new Kysely<Database>({ dialect: database.dialect });
