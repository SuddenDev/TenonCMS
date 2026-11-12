import type { Database } from "../db/types.ts";

export const FORMAT = "tenon";
export const FORMAT_VERSION = 1;
export const MANIFEST = "manifest.json";
/** The folder of media originals inside an archive. The rest of the path is the file's `key`. */
export const MEDIA = "media/";
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
export type ImportCounts = Record<TableName, number> & { media: number };
/**
 * - `replace`: deletes all content first, then inserts the archive.
 * - `merge`: inserts new rows and overwrites rows with the same id.
 * - `missing`: inserts only rows whose id does not exist yet.
 */
export type ImportMode = "replace" | "merge" | "missing";
export const IMPORT_MODES: readonly ImportMode[] = ["replace", "merge", "missing"];
