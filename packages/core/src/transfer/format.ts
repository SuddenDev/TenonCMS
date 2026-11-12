import type { Database } from "../db/types.ts";
import { readZip, type ZipEntry } from "./read-zip.ts";

export const FORMAT = "tenon";
export const FORMAT_VERSION = 2;
export const MANIFEST = "manifest.json";
/** The folder of media originals inside an archive. The rest of the path is the file's `key`. */
export const MEDIA = "media/";
/** The folder of the extra tables of a `full` archive: `tables/<table>.ndjson`. */
export const EXTRA = "tables/";
export const ZIP = "application/zip";

/**
 * Folders in media storage for archives on their way in or out. Media folders never start with a dot, so no media
 * file uses these keys, and the media library never lists them.
 */
export const IMPORTS = ".tenon/imports";
export const EXPORTS = ".tenon/exports";

/** The download name of an export: `tenon-<date>.zip`. */
export const archiveName = () => `tenon-${new Date().toISOString().slice(0, 10)}.zip`;

/** `manifest.json` of an archive. */
export type Manifest = {
  format: typeof FORMAT;
  version: number;
  /** ISO time of the export. */
  createdAt: string;
  defaultLocale: string;
  /** The localized keys of every `collection:<name>` / `global:<name>` the rows are stored for. */
  localized: Record<string, string[] | null>;
  /** Whether `media/` holds the originals. */
  media: boolean;
  /** Since version 2. `full` adds users, accounts, API keys, jobs and the other tables of {@link fullTables}. */
  scope?: ArchiveScope;
  /** Since version 2. The database the rows come from. A `full` archive restores only into the same one. */
  dialect?: Dialect;
  /** Since version 2. The applied CMS migrations. A `full` archive restores only into the same ones. */
  migrations?: string[];
  /** Since version 2, `full` only. The columns of each extra table. */
  tables?: Record<string, string[]>;
  /** Since version 2. Every `collection:<name>`, `global:<name>` and version target the rows use. */
  targets?: string[];
  /** Since version 2. What the archive holds. */
  counts?: ArchiveCounts;
};

/** `content`: documents, globals, locales and versions. `full`: also users, accounts, API keys and jobs. */
export type ArchiveScope = "content" | "full";
export const ARCHIVE_SCOPES: readonly ArchiveScope[] = ["content", "full"];
export type Dialect = "sqlite" | "postgres";

/** Rows per table, and the media files with their total size in bytes. */
export type ArchiveCounts = {
  tables: Record<string, number>;
  media: { files: number; bytes: number };
};

/**
 * What `cms.import(archive, { dryRun: true })` and `POST /import/check` answer.
 * - `errors`: why the import would fail. Empty when it would run.
 * - `deletes`: what is stored now. `replace` deletes all of it, the other modes only what the archive overwrites.
 * - `writes`: what the archive holds. `null` for an archive of format version 1, which has no counts.
 */
export type ArchiveCheck = {
  errors: string[];
  deletes: ArchiveCounts;
  writes: ArchiveCounts | null;
};

/**
 * The tables an archive holds, with their primary key and columns. Rows are stored as in the database, so a
 * restore keeps ids, times, drafts and locales. Postgres' `rowid` is left out, because the database generates it.
 */
export const TABLES = {
  cms_documents: {
    entry: "documents.ndjson",
    key: ["id"],
    columns: [
      "id",
      "collection",
      "data",
      "draft",
      "created_at",
      "updated_at",
      "published_at",
      "created_by",
      "updated_by",
    ],
  },
  cms_document_locales: {
    entry: "document-locales.ndjson",
    key: ["document_id", "locale"],
    columns: ["document_id", "locale", "data", "draft", "created_at", "updated_at", "published_at"],
  },
  cms_globals: {
    entry: "globals.ndjson",
    key: ["name"],
    columns: ["name", "data", "draft", "created_at", "updated_at", "published_at"],
  },
  cms_global_locales: {
    entry: "global-locales.ndjson",
    key: ["name", "locale"],
    columns: ["name", "locale", "data", "draft", "created_at", "updated_at", "published_at"],
  },
  cms_versions: {
    entry: "versions.ndjson",
    key: ["id"],
    columns: [
      "id",
      "target",
      "doc_id",
      "locale",
      "status",
      "data",
      "created_by",
      "created_at",
      "updated_at",
    ],
  },
} as const satisfies Partial<
  Record<keyof Database, { entry: string; key: readonly string[]; columns: readonly string[] }>
>;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

/** What an import wrote: rows per table and the number of media files. */
export type ImportCounts = Record<TableName, number> & { media: number } & Record<string, number>;
/**
 * - `replace`: deletes all content first, then inserts the archive.
 * - `merge`: inserts new rows and overwrites rows with the same id.
 * - `missing`: inserts only rows whose id does not exist yet.
 */
export type ImportMode = "replace" | "merge" | "missing";

/** Options of `cms.export()` and `cms.exportSummary()`. */
export type ExportOptions = { media?: boolean; scope?: ArchiveScope };
/** The query string of the export routes for `options`, empty for the defaults. */
export function exportQuery({ media = true, scope = "content" }: ExportOptions) {
  const query = new URLSearchParams();
  if (!media) query.set("media", "false");
  if (scope !== "content") query.set("scope", scope);
  return query.size ? `?${query}` : "";
}

/** Options of `cms.import()`. `dryRun` checks the archive and writes nothing. */
export type ImportOptions = { mode?: ImportMode; dryRun?: boolean };
export const IMPORT_MODES: readonly ImportMode[] = ["replace", "merge", "missing"];

/** @returns The manifest of a ZIP's entries, or `undefined` when it has none or it is not JSON. */
export async function manifestOf(entries: Map<string, ZipEntry>) {
  const entry = entries.get(MANIFEST);
  if (!entry) return undefined;
  try {
    return JSON.parse(await new Response(entry.stream()).text()) as Manifest;
  } catch {
    return undefined;
  }
}

/**
 * The manifest of an archive file, read without the rest of it, e.g. for `client.checkImport()`.
 * @returns `undefined` for a file that is not a tenon archive.
 */
export async function readArchiveManifest(archive: Blob) {
  const entries = await readZip(archive).catch(() => undefined);
  const manifest = entries && (await manifestOf(entries));
  return manifest?.format === FORMAT ? manifest : undefined;
}
