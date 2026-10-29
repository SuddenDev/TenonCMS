import { type Database } from "../types.ts";
import { migrator } from "./cms.ts";
import { sql, type Kysely } from "kysely";
import type { BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { isPostgres } from "../queries/document-sql.ts";

// Any fixed key. It differs from Kysely's own migration lock, which only covers the CMS migrations.
const LOCK = 74_656_239_013;

// ponytail: no locking between processes on SQLite, where Kysely's migration lock is a no-op. Run one instance per
// SQLite database.
/**
 * Runs the CMS migrations, then the better-auth migrations, plugin tables included. On Postgres both run in one
 * transaction under an advisory lock, so instances that start together on a fresh database migrate one after the
 * other, and a failed run changes nothing.
 * @throws The first migration error.
 */
export async function migrate(db: Kysely<Database>, authOptions: BetterAuthOptions) {
  if (!isPostgres(db)) return runMigrations(db, authOptions);

  // A transaction lock, because a session lock can outlive its transaction behind a pooler such as PgBouncer.
  // PGlite has one connection, so the migrations MUST run on `trx` too.
  await db.transaction().execute(async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(${LOCK})`.execute(trx);
    const database = { ...(authOptions.database as object), db: trx };
    await runMigrations(trx, { ...authOptions, database } as BetterAuthOptions);
  });
}

async function runMigrations(db: Kysely<Database>, authOptions: BetterAuthOptions) {
  const { error } = await migrator(db).migrateToLatest();
  if (error) throw error;

  await (await getMigrations(authOptions)).runMigrations();
}
