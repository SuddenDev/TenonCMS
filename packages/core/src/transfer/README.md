# transfer

Export and import of all content as one ZIP archive: `cms.export()`, `cms.import()`, `cms.exportSummary()` and their routes under `/_tenon/export` and `/_tenon/import`. A `full` archive also holds users, accounts, API keys and jobs; the `tenon backup` CLI writes one. Used for backups, for moving content between databases, and as the data of a [seed](../lifecycle/README.md). The guide is [Backup and restore](../../../../docs/guide/backup.md).

## Follow an export

`cms.export()` flows through:

`local/transfer.local.ts` → `operations/export.operation.ts` → `client-zip`

The rows of the five content tables in `format.ts` (`TABLES`) are read in one transaction, as stored: JSON text, epoch times, `NULL` drafts. Postgres' `rowid` is left out. `manifest.json` records the localized keys from `cms_schema_state`, because the rows are split for those keys. With media, the original of each media document streams from storage into `media/<key>` while the ZIP is read. Variants are left out.

## Full archives

`scope: "full"` adds the tables of `fullTables()` under `tables/<table>.ndjson`: Tenon's `cms_*` tables and better-auth's tables (`getAuthTables()`, plugin tables included), the user table first. Left out: sessions, verification tokens, rate limits, device codes, uploads in progress, locks, the schema state and the migrations. Tables of the host are never included. The manifest records the dialect, the migrations and the columns of each extra table.

A full import empties the session tables (`sessionTables()`) and the extra tables, inserts the extra rows, then runs the `replace` import of the content. So everyone is signed out, and `created_by` keeps the restored users.

The rows are written as the driver returns them, so a full archive restores only into the same dialect. Content archives stay portable.

Since format version 2, every manifest also holds `targets` and `counts`. Version 1 archives still import.

## Follow an import

`cms.import(blob, { mode })` flows through:

`local/transfer.local.ts` → `operations/import.operation.ts` → `read-zip.ts`

1. `readZip()` reads the central directory through ranged reads of a `Blob` or a `ZipSource`, so a file-backed `Blob` (`fs.openAsBlob()`) or a file in storage is never fully in memory. STORE and DEFLATE (`DecompressionStream`) only, no ZIP64.
2. `checkArchive()` checks the manifest and the targets of the rows: every collection and global MUST exist in the schema. `merge` and `missing` MUST have the same localized keys as the config, because only `replace` can move values. A `full` archive MUST use `replace`, the same dialect, the same CMS migrations and tables with its columns. `dryRun` returns this check and stops. `POST /import/check` runs it on a manifest alone, so a dry run never uploads the archive.
3. Media files stream into storage before the transaction, through `writeFile()` (`media/storage/write-file.ts`). A file stored with the same size is skipped, so a failed import can run again. A rollback leaves copied files as unused files.
4. One `transaction()`:
   - `replace` deletes the content tables, `cms_locks` and queued jobs with a target.
   - `missing` drops rows of documents and globals that exist, with their locale rows and versions.
   - `merge` deletes the locale rows of the documents and globals it overwrites.
   - Then the rows are inserted in batches of 50 with `ON CONFLICT` (`DO UPDATE` for `merge`, `DO NOTHING` otherwise).
   - `created_by` / `updated_by` become `NULL` unless the id is a user or `key:<id>` of an API key here.
   - `replace` writes the archive's localized keys to `cms_schema_state` and runs `syncLocalizedIn()`, which moves values to the config's keys.
5. After the commit: `cms.media.regenerate()` when the image provider prerenders, then `afterImport`.

No hooks, validation or webhooks run. The rows of the archive are held in memory.

## Staged import and export

Hosts limit request and response bodies (Vercel: 4.5 MB). With media, the admin moves archives through media storage instead:

- **Import** (`operations/import-upload.operation.ts`): the steps of a media upload. `POST /import/uploads` reserves a row in `cms_uploads` under the dot folder `IMPORTS` (`.tenon/imports`) and returns part URLs, presigned for S3. The parts go up like a media file. `POST /import/uploads/:id/complete?mode=` assembles the archive, imports it from storage with range reads, then deletes the file and the row, also after a failure. Media folders never start with a dot, so `findUpload()` of the media routes skips these rows, and no media document points to the file. `removeExpired()` deletes an archive that a crash left behind.
- **Export** (`operations/stage-export.operation.ts`): `POST /export` answers `{ url }`. With `storage.downloadUrl` (S3), the archive is written to `.tenon/exports/<time>-<uuid>.zip` and the URL is presigned for 12 hours; exports older than that are deleted on the next export. Without it, the URL is `GET /export`, which streams.
- `client.import()` takes the staged path and falls back to the body when `/import/uploads` is missing (`media: false`). `client.exportLink()` returns the URL.

With a public bucket (`publicUrl`), a staged archive is readable by anyone who knows its random key until it is deleted.

## Access

`requireBackup(scope, op)` in `access.ts` lets through server code (`overrideAccess`), admins and API keys with `op` on `backup`: `read` to export, `update` to import. Local API and staged operations call it; the endpoint calls it too, and adds `no-store`. `apiKeyReach()` lets a key with any `backup` grant reach these routes. The import body MUST be `application/zip`, the staged routes take JSON or raw parts: Hono's `csrf()` checks only form types, and browsers preflight these bodies cross-site.

## Files

| File                                    | Role                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| `format.ts`                             | Manifest, entry names, tables and columns, modes, staging keys |
| `access.ts`                             | `requireBackup()`                                              |
| `operations/full-tables.ts`             | `fullTables()`, `sessionTables()`: the extra tables of `full`  |
| `operations/count-archive.ts`           | `countArchive()`, `databaseState()`                            |
| `operations/check-archive.ts`           | `checkArchive()`, `archiveTargets()`                           |
| `read-zip.ts`                           | ZIP reader over a `Blob` or `ZipSource`                        |
| `operations/export.operation.ts`        | `exportContent()`                                              |
| `operations/import.operation.ts`        | `importContent()`                                              |
| `operations/import-upload.operation.ts` | The staged import steps                                        |
| `operations/stage-export.operation.ts`  | `stageExport()`: the download link                             |
| `local/transfer.local.ts`               | `cms.export()` / `cms.import()`                                |
| `endpoints/transfer.endpoint.ts`        | `/export`, `/import`, `/import/uploads`                        |
