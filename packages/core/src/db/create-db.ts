import { type Database } from "./types.ts";
import { libsqlDialect } from "./adapters/libsql.ts";
import { createClient } from "@libsql/client";
import { Kysely } from "kysely";

export function createDb(url: string, authToken?: string) {
  return new Kysely<Database>({ dialect: libsqlDialect(createClient({ url, authToken })) });
}
