import { type Database } from "./types.ts";
import { libsqlDialect } from "./adapters/libsql.ts";
import { createClient } from "@libsql/client";
import { type Dialect, Kysely } from "kysely";

/**
 * Where the CMS stores its data.
 * - `url`: a libsql database: a file (`file:cms.db`), `:memory:` or Turso (`libsql://…` with `authToken`).
 * - `dialect`: a SQLite Kysely dialect the host builds, for example over Durable Object storage. Its transactions
 *   MUST stay open across `await`, because hooks and nested writes run inside them.
 */
export type DatabaseOptions = { url: string; authToken?: string } | { dialect: Dialect };

/** Opens Kysely on the configured database. Nothing connects until the first query. */
export const createDb = (database: DatabaseOptions) =>
  new Kysely<Database>({
    dialect:
      "dialect" in database
        ? database.dialect
        : libsqlDialect(createClient({ url: database.url, authToken: database.authToken })),
  });
