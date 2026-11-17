# Media

Code: `packages/core/src/media/` (see its README).

## Model

- Media is a reserved collection named `media`. Host collections and plugins MUST NOT use the name. Generic create, update and delete reject it; media has its own operations that call the shared content writers.
- It is **on by default**: `local('./.uploads')` for storage and IPX with `prerender` for images. `media: false` turns it off. Edge runtimes (workerd) have no local disk or sharp, so there media is off unless configured, and `media: true` throws.
- Media documents live in the normal documents table. A unique index on the media key keeps keys unique.
- `image` and `file` fields store media ids and use normal relation validation.
- `url`, `src` and `srcset` are computed on read. They are typed only on the media collection, because adding them to the stored types breaks inference.

## Ordering rules

These keep storage and database from drifting apart. Keep the order.

- **Access first**: create, update and delete check `media.access` before any hook or storage effect.
- **Create or move**: touch storage first, then the database. If the database step fails, compensate in storage.
- **Delete**: delete the database document and its reference effects first, commit, then clean storage and run media hooks.
- **Rename of a folder**: can partly fail. It reports the failures. A `ValidationError`, `ForbiddenError` or `ConflictError` reports its message; any other error is logged and reports `Could not move the file`, because storage errors MAY hold keys or paths.

## Uploads

- An upload is multipart: create, put parts, complete (or abort). A table of uploads in progress reserves the key and binds the upload to its user. Another user's upload or an expired one answers 404.
- S3 completion sends XML with `Content-Type: application/xml` before signing. The [local Postgres and S3 example](../../examples/vercel/README.md) runs the adapter tests against S3Mock.
- Completing checks `parts` first (`requireUploadParts()` in `parts.ts`, also used by staged imports): each `n` a whole number within the upload's part count, each `etag` a non-empty string. A wrong list answers 400 and the upload stays.
- Completing assembles storage, checks size and image headers, writes the document with hooks, and removes the upload row, all in a transaction. Variants are rendered afterwards.
- Expired uploads are cleaned up when a new upload starts, together with a file already assembled at their key.
- Rows in a dot folder are archives of a staged import ([transfer](../../packages/core/src/transfer/README.md)). Media folders never start with a dot, so the media routes skip them.
- `writeFile()` writes a stream of unknown length into storage: one `put()`, or a multipart upload from the server. Imports and staged exports use it.

## Image variants

- A variant is a stored rendering for a set of modifiers (size, format, quality). Keys follow one scheme under a `.variants` folder.
- Variants are made on demand, or ahead of time with `prerender`.
- A provider that can render can also regenerate: it removes obsolete variants and can re-render missing ones.
- Defaults: WebP, quality 85.

## Names

The rules for file names, folders and MIME types are browser-safe and shared with the admin. Collision checks include unfinished uploads.
