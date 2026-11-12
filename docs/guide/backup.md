# Backup and restore

A backup is one ZIP file with all content: documents, globals, translations, versions and the media files. A restore writes it back with the same ids and dates, so relations, links and images keep working. Use it to back up a site, to move content to another database, or to ship sample content for a [seed](./lifecycle.md#seed).

## Export

```ts
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import cms from "./tenon.config";

const archive = await cms.export();
Readable.fromWeb(archive).pipe(createWriteStream("backup.zip"));
```

- `cms.export({ media: false })` leaves the media files out, for example when the target uses the same S3 bucket.
- Admins download it in the admin under **Manage → Backup**, or from `GET /_tenon/export` (`?media=false`).
- With S3 or R2 storage (`s3()`, `r2({ accountId, … })`), the admin writes the export into the bucket first and downloads it from there through a link that works for 12 hours. So the host's response limit (Vercel: 4.5 MB) does not apply. `client.exportLink()` returns that link; `client.export()` returns the archive as a `Blob`. With temporary credentials (`credentials`), the link stops working when they expire, which can be sooner.

## Import

```ts
import { openAsBlob } from "node:fs";

await cms.import(await openAsBlob("backup.zip"), { mode: "replace" });
```

`mode` decides what happens to content that already exists:

| Mode              | What it does                                                                  |
| ----------------- | ----------------------------------------------------------------------------- |
| `merge` (default) | Adds new entries and overwrites entries with the same id, with their locales. |
| `missing`         | Adds only entries whose id does not exist yet. Existing ones stay untouched.  |
| `replace`         | Deletes all documents, globals and versions first, then writes the archive.   |

- The import runs in one transaction. A failure changes nothing, except media files that were already copied to storage.
- It restores stored rows: no hooks, no validation and no webhooks run. Plugins rebuild derived data in [`afterImport`](./lifecycle.md#afterimport).
- Every collection and global in the archive MUST exist in your schema.
- `merge` and `missing` need the archive to store the same localized fields as your config. `replace` also moves values between shared and translated fields, like a deploy that changes `localized` does.
- In the admin, **Manage → Backup** imports a file. It uploads the file into media storage in parts first, like a media file, then imports it from there and deletes it. So the host's request limit (Vercel: 4.5 MB) does not apply. `client.import()` does the same.
- Without media (`media: false`), the file goes in one request: `POST /_tenon/import?mode=replace` with the ZIP as the body and `content-type: application/zip`. Hosts limit its size; import big archives with `cms.import()` from a script.
- Media files already in storage with the same size are not copied again. A failed import can simply run again.
- All of this is for admins only.

## An archive of an older schema

The import writes the stored rows as they are. Nothing migrates them to your current fields.

- A collection or global that no longer exists stops the import. Add it back, or edit the archive.
- A removed or renamed field keeps its value in the database, but reads leave it out. The next save of that document drops it.
- A field whose type changed keeps the old value. Reads return it as stored, and the next save fails validation until an editor fixes it.
- A new required field is empty. The next publish asks for it.

The same applies to content saved before a deploy that changes fields.

## What is not included

- Users, sessions and API keys. `createdBy` and `updatedBy` keep a user's id when that user exists in the target database, otherwise they become empty. Copy the database itself for a full clone with users (the SQLite file, `pg_dump`, Turso's tools).
- Jobs and scheduled publishes. `replace` drops the queued ones of the old content.
- Image variants. They are rendered again on request, or by `cms.media.regenerate()` with `prerender`, which a restore with media files runs for you.
- `replace` leaves the old media files in storage. Delete unused files yourself.

## Storage

Archives on their way in or out live in media storage under `.tenon/`. The media library never shows them.

- An import deletes its archive when it ends. An export stays until the next export after 12 hours.
- With a public bucket (`publicUrl`), anyone who knows an archive's random key can read it until then. Add a lifecycle rule that deletes `.tenon/` objects after one day, next to the rule for incomplete multipart uploads.

## The archive

| Entry                     | Holds                                                  |
| ------------------------- | ------------------------------------------------------ |
| `manifest.json`           | Format version, date, default locale, localized fields |
| `documents.ndjson`        | One document per line, as stored                       |
| `document-locales.ndjson` | The translations of each document                      |
| `globals.ndjson`          | Globals                                                |
| `global-locales.ndjson`   | The translations of each global                        |
| `versions.ndjson`         | The version history                                    |
| `media/<key>`             | The original of each media file                        |

The rows are the same on SQLite and Postgres, so an archive moves between them. Archives MUST stay under 4 GB.
