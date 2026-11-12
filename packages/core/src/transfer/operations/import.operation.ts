import { consola } from "consola";
import type { Kysely } from "kysely";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { afterCommit, databaseForScope, transaction } from "../../cms/runtime/transaction.ts";
import { syncLocalizedIn } from "../../db/migrations/sync-localized.ts";
import type { Database } from "../../db/types.ts";
import { ValidationError } from "../../errors.ts";
import { runAfterImport } from "../../lifecycle/run-lifecycle.ts";
import { regenerate } from "../../media/operations/regenerate.operation.ts";
import type { Storage } from "../../media/storage/types.ts";
import { writeFile } from "../../media/storage/write-file.ts";
import { readZip, type ZipEntry, type ZipSource } from "../read-zip.ts";
import {
  FORMAT,
  FORMAT_VERSION,
  type ImportCounts,
  type ImportMode,
  MANIFEST,
  MEDIA,
  type Manifest,
  TABLES,
  TABLE_NAMES,
  type TableName,
} from "../format.ts";

type Row = Record<string, unknown>;
type Rows = Record<TableName, Row[]>;

// Rows per insert. It stays below SQLite's limit of bound parameters.
const BATCH = 50;

/**
 * Writes an archive from `exportContent()` into the database, with its ids, times, drafts, locales and versions. Runs
 * no hooks, validation or webhooks, because it restores stored rows. Media files are put into storage before the
 * transaction, so a rollback leaves them as unused files. A file already stored with the same size is skipped, so a
 * failed import can simply run again.
 * @param mode See {@link ImportMode}. `merge` also replaces the locale rows of each document it overwrites.
 * @returns Rows written per table, and the media files of the archive that are in storage now.
 * @throws {ValidationError} For a file that is not an archive, an entry the schema does not have, or with `merge` and
 * `missing`, rows stored for other localized fields than the config's.
 */
export async function importContent(
  core: Core,
  scope: Scope,
  archive: Blob | ZipSource,
  { mode = "merge" }: { mode?: ImportMode } = {},
): Promise<ImportCounts> {
  const entries = await readArchive(archive);
  const manifest = await readManifest(entries);
  const rows = await readRows(entries);
  requireKnownEntries(core, rows);
  if (mode !== "replace") requireSameLocalized(core, manifest, rows);

  const files = await putMedia(core, entries, rows.cms_documents);

  const { counts, messages } = await transaction(core, scope, async (inner) => {
    const db = await databaseForScope(core, inner);
    if (mode === "replace") await deleteContent(db);
    const keep = mode === "missing" ? await newRows(db, rows) : rows;
    if (mode === "merge") await deleteLocaleRows(db, rows);
    const actors = await knownActors(db);
    const counts = { media: files } as ImportCounts;
    for (const table of TABLE_NAMES)
      counts[table] = await insertRows(db, table, keep[table].map(withActors(actors)), mode);

    const synced =
      mode === "replace" ? await syncTo(db, core, manifest) : { messages: [] as string[] };

    afterCommit(inner, async (s) => {
      if (files && core.media?.images?.provider.prerender) await regenerate(core, s);
      await runAfterImport(core, s.cms, { mode, counts });
    });
    return { counts, messages: synced.messages };
  });

  for (const m of messages) consola.withTag("tenon").info(m);
  return counts;
}

async function readArchive(archive: Blob | ZipSource) {
  try {
    return await readZip(archive);
  } catch (error) {
    throw new ValidationError({ archive: (error as Error).message });
  }
}

async function readManifest(entries: Map<string, ZipEntry>) {
  const entry = entries.get(MANIFEST);
  const manifest = entry
    ? (JSON.parse(await new Response(entry.stream()).text()) as Manifest)
    : undefined;
  if (manifest?.format !== FORMAT) throw new ValidationError({ archive: "Not a tenon archive" });
  if (manifest.version > FORMAT_VERSION)
    throw new ValidationError({
      archive: `The archive has format version ${manifest.version}, this version reads up to ${FORMAT_VERSION}`,
    });
  return manifest;
}

async function readRows(entries: Map<string, ZipEntry>) {
  const rows = {} as Rows;
  for (const table of TABLE_NAMES) {
    const entry = entries.get(TABLES[table].entry);
    const text = entry ? await new Response(entry.stream()).text() : "";
    rows[table] = text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Row);
  }
  return rows;
}

function requireKnownEntries(core: Core, rows: Rows) {
  const { collections, globals } = core.schema;
  const unknown = new Set([
    ...rows.cms_documents.map((r) => `collection:${r.collection}`),
    ...rows.cms_globals.map((r) => `global:${r.name}`),
    ...rows.cms_versions.map((r) => r.target as string),
  ]);
  for (const id of unknown) {
    const [kind, name] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
    if ((kind === "collection" ? collections : globals)[name]) unknown.delete(id);
  }
  if (unknown.size)
    throw new ValidationError({
      archive: `The schema has no ${[...unknown].join(", ")}. Add them, or edit the archive.`,
    });
}

// Only `replace` moves stored values between shared and locale rows, so the other modes need the config's layout.
function requireSameLocalized(core: Core, manifest: Manifest, rows: Rows) {
  const { current, defaultLocale } = core.localized;
  const used = new Set([
    ...rows.cms_documents.map((r) => `collection:${r.collection}`),
    ...rows.cms_globals.map((r) => `global:${r.name}`),
  ]);
  const key = (keys: string[] | null | undefined) => JSON.stringify([...(keys ?? [])].sort());
  const differs = [...used].filter((id) => key(manifest.localized[id]) !== key(current[id]));
  const localized = [...used].some((id) => current[id]);
  if (differs.length || (localized && manifest.defaultLocale !== defaultLocale))
    throw new ValidationError({
      archive: `The archive stores other localized fields (${differs.join(", ") || "defaultLocale"}). Import it with mode "replace", or export it again on this config.`,
    });
}

async function putMedia(core: Core, entries: Map<string, ZipEntry>, documents: Row[]) {
  if (!core.media) return 0;
  const mimeTypes = new Map(
    documents
      .filter((r) => r.collection === "media")
      .map((r) => JSON.parse(r.data as string) as { key: string; mimeType: string })
      .map((m) => [m.key, m.mimeType]),
  );
  let n = 0;
  for (const [name, entry] of entries) {
    if (!name.startsWith(MEDIA)) continue;
    const key = name.slice(MEDIA.length);
    const mimeType = mimeTypes.get(key);
    if (!mimeType || key.split("/").includes("..")) continue;
    if ((await storedSize(core.media.storage, key)) !== entry.size)
      await writeFile(core.media.storage, key, entry.stream(), mimeType);
    n++;
  }
  return n;
}

// The size of a stored file, from a one-byte read. `undefined` for a missing file.
async function storedSize(storage: Storage, key: string) {
  const file = await storage.get(key, { start: 0, end: 0 }).catch(() => undefined);
  await file?.body.cancel();
  return file?.size;
}

async function deleteContent(db: Kysely<Database>) {
  for (const table of TABLE_NAMES) await db.deleteFrom(table).execute();
  await db.deleteFrom("cms_locks").execute();
  // Scheduled publishes and webhook deliveries of the old content.
  await db
    .deleteFrom("cms_jobs")
    .where("status", "=", "queued")
    .where("target", "is not", null)
    .execute();
}

// `missing` skips a document or global that exists, together with its locale rows and versions.
async function newRows(db: Kysely<Database>, rows: Rows): Promise<Rows> {
  const ids = rows.cms_documents.map((r) => r.id as string);
  const names = rows.cms_globals.map((r) => r.name as string);
  const docs = new Set(
    ids.length
      ? (await db.selectFrom("cms_documents").select("id").where("id", "in", ids).execute()).map(
          (r) => r.id,
        )
      : [],
  );
  const globals = new Set(
    names.length
      ? (
          await db.selectFrom("cms_globals").select("name").where("name", "in", names).execute()
        ).map((r) => r.name)
      : [],
  );
  const owner = (r: Row) =>
    (r.target as string).startsWith("global:")
      ? globals.has((r.target as string).slice("global:".length))
      : docs.has(r.doc_id as string);
  return {
    cms_documents: rows.cms_documents.filter((r) => !docs.has(r.id as string)),
    cms_document_locales: rows.cms_document_locales.filter(
      (r) => !docs.has(r.document_id as string),
    ),
    cms_globals: rows.cms_globals.filter((r) => !globals.has(r.name as string)),
    cms_global_locales: rows.cms_global_locales.filter((r) => !globals.has(r.name as string)),
    cms_versions: rows.cms_versions.filter((r) => !owner(r)),
  };
}

async function deleteLocaleRows(db: Kysely<Database>, rows: Rows) {
  const ids = rows.cms_documents.map((r) => r.id as string);
  const names = rows.cms_globals.map((r) => r.name as string);
  if (ids.length)
    await db.deleteFrom("cms_document_locales").where("document_id", "in", ids).execute();
  if (names.length) await db.deleteFrom("cms_global_locales").where("name", "in", names).execute();
}

// Users and API keys are not part of an archive. `createdBy` keeps an id only when it exists here.
async function knownActors(db: Kysely<Database>) {
  const users = await (db as Kysely<any>).selectFrom("user").select("id").execute();
  const keys = await (db as Kysely<any>).selectFrom("apikey").select("id").execute();
  return new Set([
    ...users.map((r: { id: string }) => r.id),
    ...keys.map((r: { id: string }) => `key:${r.id}`),
  ]);
}

const withActors = (actors: Set<string>) => (row: Row) => {
  const out = { ...row };
  for (const column of ["created_by", "updated_by"])
    if (column in out && out[column] !== null && !actors.has(out[column] as string))
      out[column] = null;
  return out;
};

async function insertRows(db: Kysely<Database>, table: TableName, rows: Row[], mode: ImportMode) {
  const { key, columns } = TABLES[table];
  const update = columns.filter((c) => !(key as readonly string[]).includes(c));
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows
      .slice(i, i + BATCH)
      .map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null])));
    await (db as Kysely<any>)
      .insertInto(table)
      .values(values)
      .onConflict((oc) => {
        const target = oc.columns(key as unknown as string[]);
        return mode === "merge"
          ? target.doUpdateSet(
              Object.fromEntries(update.map((c) => [c, (eb: any) => eb.ref(`excluded.${c}`)])),
            )
          : target.doNothing();
      })
      .execute();
  }
  return rows.length;
}

// The rows are stored for the archive's localized fields. Recording those lets the sync move them to the config's.
async function syncTo(db: Kysely<Database>, core: Core, manifest: Manifest) {
  for (const [id, keys] of Object.entries(manifest.localized)) {
    const i = id.indexOf(":");
    const row = {
      kind: id.slice(0, i),
      name: id.slice(i + 1),
      localized: keys && JSON.stringify(keys),
    };
    await db
      .insertInto("cms_schema_state")
      .values(row)
      .onConflict((oc) => oc.columns(["kind", "name"]).doUpdateSet({ localized: row.localized }))
      .execute();
  }
  const { current, defaultLocale, fields } = core.localized;
  return syncLocalizedIn(db, current, defaultLocale, fields);
}
