import { type Database } from "../types.ts";
import { migrator } from "./cms.ts";
import type { Kysely } from "kysely";
import type { BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

// ponytail: no locking between processes on SQLite, where Kysely's migration lock is a no-op. Run one instance per
// SQLite database. Postgres takes an advisory lock.
/**
 * Runs the CMS migrations, then the better-auth migrations, plugin tables included.
 * @throws The first migration error.
 */
export async function migrate(db: Kysely<Database>, authOptions: BetterAuthOptions) {
  const { error } = await migrator(db).migrateToLatest();
  if (error) throw error;

  await (await getMigrations(authOptions)).runMigrations();
}
