# Media

The media library: uploads, the reserved `media` collection, storage adapters and image providers. On by default: an omitted `media` or `media: true` uses `default.ts`; `media: false` turns it off. Media documents are written through the [content](../content/README.md) engine (`content/writes/write-document.ts` and `remove-document.ts`), never through the generic collection API. Routes mount under `/media` in [http](../http/app.ts).

## Follow an upload

`POST /api/cms/media/uploads` and the requests after it flow through:

`endpoints/uploads.endpoint.ts` → `operations/uploads/create.operation.ts` → `put-part.operation.ts` → `complete.operation.ts`

`create()` checks size and type, runs `beforeUpload`, reserves a free key in `cms_uploads` and starts the upload in storage. It returns one URL per part: presigned for direct storage (S3), the part route for proxied storage (local). `putPart()` streams one part into storage and enforces its length. `complete()` assembles the file, checks its size and image header, then creates the document, runs `afterUpload` and deletes the upload row in one transaction. On failure the file and the row go. With a `prerender` provider it renders variants after commit. `abort()` drops an unfinished upload. `cms.media.upload()` (`upload.operation.ts`) runs the same steps without HTTP.

## Follow a move

`cms.media.update(id, { folder })` enters `operations/update/update.operation.ts`. `placeOf()` (`place.ts`) works out the new folder, filename and key. In one transaction `moveFile()` (`move-file.ts`) checks that the name is free, runs `beforeMove` and moves the file and its variants; then `update()` writes the document and runs `afterMove`. The transaction lifetime registers the inverse move before variants move. Outer rollback reverses moves in order, even after a nested update succeeds. `renameFolder()` calls `update()` once per document and reports partial failures.

Deletion registers `deleteWithVariants()` and `afterDelete` with the same transaction owner. Pending deletions keep their filenames reserved across scopes of the instance in `library/names-in.ts`, so an upload or move cannot overwrite bytes still needed for rollback. Each key is released after its storage cleanup, before its hook runs. Commit hooks receive a fresh API. Upload creation registers resource abort; completion registers abort and file/row cleanup against a live connection after rollback, and schedules prerendering after outer commit using the current document key, or skips it if the document is deleted.

## Follow a download

`endpoints/download.endpoint.ts` → `operations/download-archive.operation.ts` → `storage.get()`

`GET /api/cms/media/download?id=<id>&folder=<path>` requires a session. Repeated `id` and `folder` parameters select originals; a single file uses `serveFile()` with range support. Folder or mixed selections enter `downloadArchive()`, which resolves matching documents and streams a ZIP through `client-zip`, retaining folder names and nested paths. Variants and unfinished uploads are excluded. Sources open one at a time and close when the download is cancelled. Selected empty folders produce directory entries, since folders have no database records. An empty folder parameter is invalid.

## Files

| Path                                              | Responsibility                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `index.ts`                                        | Public option, storage and provider types, the reserved collection and `mediaApi`.                                 |
| `api.ts`                                          | `cms.media` of one scope.                                                                                          |
| `config/`                                         | `MediaOptions` / `ImagesOptions` and the reserved collection definition.                                           |
| `runtime/create-media-core.ts`                    | Resolves the option with defaults, checks presets and providers, builds the allowlist; `mediaOf()`.                |
| `runtime/read-media.ts`                           | `loadMedia()` and `readMedia()`, which adds URLs with the global image options.                                    |
| `runtime/run-media-hooks.ts`                      | Runs host hooks, then plugin hooks in registration order.                                                          |
| `operations/uploads/*.operation.ts`               | The upload steps `create`, `putPart`, `complete` and `abort` (with `discard()`), and `upload()` for the local API. |
| `operations/uploads/check-file.ts`                | Checks the announced size and type.                                                                                |
| `operations/uploads/place-file.ts`                | Runs `beforeUpload` and picks a free filename.                                                                     |
| `operations/uploads/parts.ts`                     | Part size, part count, part length and part URLs.                                                                  |
| `operations/uploads/file-data.ts`                 | Document data of an assembled file, with image dimensions.                                                         |
| `operations/uploads/upload-row.ts`                | The `cms_uploads` row: lookup by owner and delete.                                                                 |
| `operations/uploads/remove-expired.ts`            | Aborts uploads older than a day.                                                                                   |
| `operations/uploads/chunks.ts`                    | Splits bytes or a stream into parts for `upload()`.                                                                |
| `operations/update/update.operation.ts`           | `alt` changes and moves in one transaction.                                                                        |
| `operations/update/place.ts`                      | The target place of a file and the free-name check.                                                                |
| `operations/update/move-file.ts`                  | Moves the original, registers its inverse, then moves variants.                                                    |
| `operations/rename-folder.operation.ts`           | Moves every file of a folder.                                                                                      |
| `operations/folders.operation.ts`                 | Lists the folders of the files the caller MAY read.                                                                |
| `operations/download-archive.operation.ts`        | Streams selected originals into a ZIP and cancels the active storage read.                                         |
| `operations/delete.operation.ts`                  | Deletes the document; schedules files and hooks after outer commit.                                                |
| `operations/regenerate.operation.ts`              | Brings stored variants in line with the image options.                                                             |
| `library/names.ts`                                | Filename and folder rules, storage keys, free names and MIME matching. Browser-safe.                               |
| `library/names-in.ts`                             | Names used by documents and unfinished uploads.                                                                    |
| `library/selection.ts`                            | Folder containment, recursive file selection and move destinations. Browser-safe.                                  |
| `images/`                                         | Provider types, modifiers, variant selection, allowlist, `/img` path parsing and URL decoration.                   |
| `images/ipx.ts`, `images/cloudflare.ts`           | Providers; `integral-cms/media/ipx` and `integral-cms/media/cloudflare`.                                           |
| `variants/keys.ts`                                | Variant key layout and listing.                                                                                    |
| `variants/render-variants.ts`                     | Renders and stores one or many variants.                                                                           |
| `variants/move-variants.ts`, `delete-variants.ts` | Moves or deletes a file with its variants.                                                                         |
| `variants/remove-orphans.ts`                      | Deletes variants of files that no longer exist.                                                                    |
| `endpoints/routes.ts`                             | Groups the routes: `files` before the caller lookup, `reads` and `writes` behind it.                               |
| `endpoints/*.endpoint.ts`                         | One Hono sub-app per capability.                                                                                   |
| `endpoints/serve-file.ts`                         | Range responses and the sandbox headers of every served file.                                                      |
| `endpoints/request-context.ts`                    | Body parsing and the user scope.                                                                                   |
| `storage/types.ts`                                | Storage adapter contract.                                                                                          |
| `storage/local/index.ts`                          | `local()`, `integral-cms/media/local`: file reads, writes, moves and listing.                                      |
| `storage/local/disk.ts`                           | Safe paths under the directory and removal of empty folders.                                                       |
| `storage/local/uploads.ts`                        | Uploads through one temp file per upload under `.tmp/`.                                                            |
| `storage/s3/index.ts`                             | `s3()`, `integral-cms/media/s3`: object reads, writes, moves and listing.                                          |
| `storage/s3/client.ts`                            | Signed requests and URLs for one bucket.                                                                           |
| `storage/s3/multipart.ts`                         | Multipart uploads to presigned URLs, and multipart copies above 5 GB.                                              |
| `storage/s3/encoding.ts`                          | RFC 3986 key paths and XML text.                                                                                   |
| `default.ts`                                      | Local storage and prerendered IPX; `integral-cms/media/default`.                                                   |
| `workerd.ts`                                      | What Workers resolve for local, IPX and the default: errors instead of Node code.                                  |

The storage and provider files are their own package entries, so `node:fs`, `ipx` and `aws4fetch` never reach a bundle that does not import them.

Rules:

- Media documents change only through the media API. The local API's `create`, `update` and `delete` reject `media`, so the generic routes and `cms.create('media')` answer 400.
- Storage creation and moves precede database writes and compensate on failure. Deletion commits the document and reference effects before storage cleanup. A failure leaves at most a stray object in storage, never a document that points to a missing file.
- `cms_uploads` holds uploads in progress: it reserves the key and binds the upload to its user. Another user's upload answers 404.
- Media documents live in `cms_documents`. `cms_media_key_idx` keeps `key` unique; `/files` and `/img` look documents up with `mediaByKey()`, which uses it.
- Variants live under `.variants/<key>/<modifiers>`, so `storage.list('.variants/<key>/')` finds one file's variants. Regeneration uses this layout for orphan cleanup.
- `.variants` and `.tmp` are reserved folder names.
