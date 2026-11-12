import { makeZip } from "client-zip";
import type { Kysely } from "kysely";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { databaseForScope, transaction } from "../../cms/runtime/transaction.ts";
import type { Database } from "../../db/types.ts";
import type { Storage } from "../../media/storage/types.ts";
import {
  type ArchiveScope,
  EXTRA,
  FORMAT,
  FORMAT_VERSION,
  MANIFEST,
  MEDIA,
  type Manifest,
  TABLES,
  TABLE_NAMES,
} from "../format.ts";
import { archiveTargets } from "./check-archive.ts";
import { countArchive, databaseState } from "./count-archive.ts";
import { fullTables } from "./full-tables.ts";

/**
 * Writes all content into a ZIP archive: documents, globals, locale rows and versions as stored, and with `media` the
 * original of every media file. `scope: "full"` adds the tables of {@link fullTables}: users, accounts, API keys,
 * jobs. The rows are read in one transaction, so they are consistent.
 * @returns The ZIP body. Media files stream from storage one at a time while the body is read.
 */
export async function exportContent(
  core: Core,
  scope: Scope,
  { media = true, scope: archive = "content" }: { media?: boolean; scope?: ArchiveScope } = {},
) {
  const withMedia = media && !!core.media;
  const { manifest, tables } = await transaction(core, scope, async (inner) =>
    readContent(await databaseForScope(core, inner), core, withMedia, archive),
  );

  const files = tables.flatMap(({ entry, rows }) =>
    rows.length ? [{ name: entry, input: rows.map((r) => `${JSON.stringify(r)}\n`).join("") }] : [],
  );
  const keys = withMedia
    ? (tables.find((t) => t.table === "cms_documents")?.rows ?? [])
        .filter((r) => r.collection === "media")
        .map((r) => JSON.parse(r.data as string).key as string)
    : [];

  return makeZip(
    entries(
      [{ name: MANIFEST, input: JSON.stringify(manifest, null, 2) }, ...files],
      keys,
      core.media?.storage,
    ),
  );
}

// ponytail: one table at a time in memory. Page by key when sites get large.
async function readContent(db: Kysely<Database>, core: Core, media: boolean, scope: ArchiveScope) {
  const state = await db.selectFrom("cms_schema_state").selectAll().execute();
  const extra = scope === "full" ? await fullTables(core, db) : [];
  const manifest: Manifest = {
    format: FORMAT,
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    defaultLocale: core.localization?.defaultLocale ?? "",
    localized: Object.fromEntries(
      state
        .filter((r) => r.kind !== "meta")
        .map((r) => [`${r.kind}:${r.name}`, r.localized === null ? null : JSON.parse(r.localized)]),
    ),
    media,
    scope,
    ...(await databaseState(db)),
    ...(scope === "full" && { tables: Object.fromEntries(extra.map((t) => [t.name, t.columns])) }),
    counts: await countArchive(core, db, { scope, media }),
  };
  const tables: { table: string; entry: string; rows: Record<string, unknown>[] }[] = [];
  for (const table of TABLE_NAMES) {
    const { entry, columns, key } = TABLES[table];
    let query = db.selectFrom(table).select(columns as never);
    for (const k of key) query = query.orderBy(k as never);
    const rows = (await query.execute()) as Record<string, unknown>[];
    tables.push({ table, entry, rows });
  }
  for (const { name, columns } of extra) {
    const rows = (await (db as Kysely<any>).selectFrom(name).select(columns).execute()) as Record<
      string,
      unknown
    >[];
    tables.push({ table: name, entry: `${EXTRA}${name}.ndjson`, rows });
  }
  const rows = (table: string) => tables.find((t) => t.table === table)!.rows;
  manifest.targets = archiveTargets({
    documents: rows("cms_documents"),
    globals: rows("cms_globals"),
    versions: rows("cms_versions"),
  });
  return { manifest, tables };
}

async function* entries(
  files: { name: string; input: string }[],
  keys: string[],
  storage: Storage | undefined,
) {
  yield* files;
  for (const key of keys) {
    const file = await storage!.get(key);
    // A media document without its file is exported without it. A restore keeps the document.
    if (file) yield { name: `${MEDIA}${key}`, input: file.body };
  }
}
