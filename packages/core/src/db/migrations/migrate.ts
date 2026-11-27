import { isPostgres } from "../create-db.ts";
import type { Db } from "../types.ts";
import { migrator } from "./cms.ts";
import { sql } from "kysely";
import type { BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

// Any fixed key. It differs from Kysely's own migration lock, which only covers the CMS migrations.
const LOCK = 74_656_239_013;
const TRIES = 10;

// ponytail: node:sqlite and Durable Objects migrate without a transaction or lock. Run one instance per database.
/**
 * Runs the CMS migrations, then the better-auth migrations, plugin tables included. Where the dialect runs DDL in a
 * transaction (Postgres, PGlite, libSQL), both run in one, so a failed run changes nothing. Instances that start
 * together on a fresh database migrate one after the other: Postgres waits for an advisory lock, libSQL for the
 * database's write lock. An instance on a migrated database only reads, so it blocks no writer.
 * @throws The first migration error.
 */
export async function migrate(db: Db, authOptions: BetterAuthOptions) {
  if (!db.getExecutor().adapter.supportsTransactionalDdl) return runMigrations(db, authOptions);

  // A libSQL file answers busy instead of waiting. The client then keeps the failed `BEGIN` open on that connection,
  // so its next commit fails too (@libsql/client 0.18). So each try checks first: the instance that lost the race
  // finds the work done.
  for (let attempt = 1; !(await upToDate(db, authOptions)); attempt++) {
    try {
      // A transaction lock, because a session lock can outlive its transaction behind a pooler such as PgBouncer.
      // PGlite and `:memory:` libSQL have one connection, so the migrations MUST run on `trx` too.
      return await db.transaction().execute(async (trx) => {
        if (isPostgres(db)) await sql`SELECT pg_advisory_xact_lock(${LOCK})`.execute(trx);
        const database = { ...(authOptions.database as object), db: trx };
        await runMigrations(trx, { ...authOptions, database } as BetterAuthOptions);
      });
    } catch (error) {
      if (attempt === TRIES || !isBusy(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}

const isBusy = (error: unknown) =>
  String((error as { code?: unknown } | undefined)?.code).startsWith("SQLITE_BUSY");

async function upToDate(db: Db, authOptions: BetterAuthOptions) {
  if ((await migrator(db).getMigrations()).some((m) => !m.executedAt)) return false;
  const auth = await getMigrations(authOptions);
  return !auth.toBeCreated.length && !auth.toBeAdded.length && !auth.toBeAddedIndexes.length;
}

async function runMigrations(db: Db, authOptions: BetterAuthOptions) {
  const { error } = await migrator(db).migrateToLatest();
  if (error) throw error;

  await (await getMigrations(authOptions)).runMigrations();
}
