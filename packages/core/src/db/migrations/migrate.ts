import { type Database } from "../types.ts";
import { migrator } from "./cms.ts";
import type { Kysely } from "kysely";
import type { BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

// ponytail: no locking between processes; Kysely's migration lock is a no-op on SQLite. Run one instance per database until D1/Postgres.
// Auth tables come from better-auth after the CMS tables, plugin tables included.
export async function migrate(db: Kysely<Database>, authOptions: BetterAuthOptions) {
  const { error } = await migrator(db).migrateToLatest();
  if (error) throw error;
  await (await getMigrations(authOptions)).runMigrations();
}
