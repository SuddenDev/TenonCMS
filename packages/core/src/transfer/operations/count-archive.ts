import type { Kysely } from "kysely";
import type { Core } from "../../cms/runtime/types.ts";
import { isPostgres } from "../../db/queries/document-sql.ts";
import type { Database } from "../../db/types.ts";
import { type ArchiveCounts, type ArchiveScope, type Dialect, TABLE_NAMES } from "../format.ts";
import { fullTables } from "./full-tables.ts";

/**
 * Counts what an archive of the database holds: rows per table and, with `media`, the media files and their size.
 * Run it in the transaction that reads the rows, so the counts match them.
 */
export async function countArchive(
  core: Core,
  db: Kysely<Database>,
  { scope = "content", media = true }: { scope?: ArchiveScope; media?: boolean } = {},
): Promise<ArchiveCounts> {
  const names = [
    ...TABLE_NAMES,
    ...(scope === "full" ? (await fullTables(core, db)).map((t) => t.name) : []),
  ];
  const tables: Record<string, number> = {};
  for (const name of names) {
    const row = await (db as Kysely<any>)
      .selectFrom(name)
      .select((eb) => eb.fn.countAll().as("n"))
      .executeTakeFirstOrThrow();
    tables[name] = Number(row.n);
  }
  return { tables, media: media && core.media ? await countMedia(db) : { files: 0, bytes: 0 } };
}

// ponytail: reads every media document. Sum in SQL once media libraries get large.
async function countMedia(db: Kysely<Database>) {
  const rows = await db
    .selectFrom("cms_documents")
    .select("data")
    .where("collection", "=", "media")
    .execute();
  const bytes = rows.reduce((sum, r) => sum + (Number(JSON.parse(r.data).size) || 0), 0);
  return { files: rows.length, bytes };
}

/** The dialect and the applied CMS migrations, in order. A `full` archive restores only where both match. */
export async function databaseState(db: Kysely<Database>) {
  const dialect: Dialect = isPostgres(db) ? "postgres" : "sqlite";
  const rows = await (db as Kysely<any>)
    .selectFrom("cms_kysely_migration")
    .select("name")
    .orderBy("name")
    .execute();
  return { dialect, migrations: rows.map((r: { name: string }) => r.name) };
}
