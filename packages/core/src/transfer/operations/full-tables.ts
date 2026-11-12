import type { BetterAuthOptions } from "better-auth";
import { getAuthTables } from "better-auth/db";
import type { Kysely } from "kysely";
import type { Core } from "../../cms/runtime/types.ts";
import type { Database } from "../../db/types.ts";
import { TABLE_NAMES } from "../format.ts";

// Tenon's tables that a `full` archive leaves out: uploads in progress, edit locks, the schema state and migrations.
const SKIPPED = [
  "cms_uploads",
  "cms_locks",
  "cms_schema_state",
  "cms_kysely_migration",
  "cms_kysely_migration_lock",
];
// better-auth's tables that a `full` archive leaves out: sessions, tokens and counters.
const SKIPPED_AUTH = ["session", "verification", "rateLimit", "deviceCode"];

/**
 * The tables a `full` archive holds besides the content tables: Tenon's `cms_*` tables and better-auth's tables,
 * plugin tables included. Tables of the host are never part of it.
 * @returns The tables with their columns, the user table first, so rows that point to a user insert after it.
 * Postgres' generated `rowid` is left out.
 */
export async function fullTables(core: Core, db: Kysely<Database>) {
  const options = (await core.auth()).options;
  const auth = authTableNames(options);
  const skipped = new Set([...SKIPPED, ...auth.skipped, ...TABLE_NAMES]);
  const tables = (await db.introspection.getTables())
    .filter((t) => (t.name.startsWith("cms_") || auth.kept.has(t.name)) && !skipped.has(t.name))
    .map((t) => ({
      name: t.name,
      columns: t.columns.map((c) => c.name).filter((c) => c !== "rowid"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [
    ...tables.filter((t) => t.name === auth.user),
    ...tables.filter((t) => t.name !== auth.user),
  ];
}

/**
 * better-auth's tables that point to a user and stay out of a `full` archive: sessions, and device codes when the
 * plugin is on. A full restore empties them, so nobody keeps a session of a user it replaced.
 */
export async function sessionTables(core: Core, db: Kysely<Database>) {
  const tables = getAuthTables((await core.auth()).options);
  const names = [tables.session?.modelName, tables.deviceCode?.modelName].filter(Boolean);
  const existing = new Set((await db.introspection.getTables()).map((t) => t.name));
  return names.filter((n) => existing.has(n));
}

function authTableNames(options: BetterAuthOptions) {
  const tables = getAuthTables(options);
  const skipped = new Set(SKIPPED_AUTH.map((key) => tables[key]?.modelName).filter(Boolean));
  const kept = new Set(
    Object.values(tables)
      .map((t) => t.modelName)
      .filter((name) => !skipped.has(name)),
  );
  return { kept, skipped, user: tables.user.modelName };
}
