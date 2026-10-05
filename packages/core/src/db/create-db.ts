import { type Database } from "./types.ts";
import { libsqlDialect } from "./adapters/libsql.ts";
import { createClient } from "@libsql/client";
import { Kysely } from "kysely";

/** Opens Kysely on a libsql database (a file, `:memory:` or Turso). Nothing connects until the first query. */
export const createDb = (url: string, authToken?: string) =>
  new Kysely<Database>({ dialect: libsqlDialect(createClient({ url, authToken })) });
