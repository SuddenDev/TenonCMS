# Media

The media library: uploads, the reserved `media` collection, storage adapters and image providers. On by default: an omitted `media` or `media: true` uses `default.ts`; `media: false` turns it off. Media documents are written through the [content](../content/README.md) engine (`content/writes/write-document.ts` and `remove-document.ts`), never through the generic collection API. Routes mount under `/media` in [http](../http/app.ts).

## Follow an upload

`POST /api/cms/media/uploads` and the requests after it flow through:

`endpoints/uploads.endpoint.ts` → `operations/uploads/create.operation.ts` → `put-part.operation.ts` → `complete.operation.ts`

`create()` checks size and type, runs `beforeUpload`, reserves a free key in `cms_uploads` and starts the upload in storage. It returns one URL per part: presigned for direct storage (S3), the part route for proxied storage (local). `putPart()` streams one part into storage and enforces its length. `complete()` assembles the file, checks its size and image header, then creates the document, runs `afterUpload` and deletes the upload row in one transaction. On failure the file and the row go. With a `prerender` provider it renders variants after commit. `abort()` drops an unfinished upload. `cms.media.upload()` (`upload.operation.ts`) runs the same steps without HTTP.

## Follow a move

`cms.media.update(id, { folder })` enters `operations/update/update.operation.ts`. `placeOf()` (`place.ts`) works out the new folder, filename and key. In one transaction `moveFile()` (`move-file.ts`) checks that the name is free, runs `beforeMove` and moves the file and its variants; then `update()` writes the document and runs `afterMove`. A failed transaction moves the file back with `moveBack()`. `renameFolder()` calls `update()` once per document and reports partial failures.

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
| `operations/update/move-file.ts`                  | Moves a file with its variants, and moves it back after a failure.                                                 |
| `operations/rename-folder.operation.ts`           | Moves every file of a folder.                                                                                      |
| `operations/folders.operation.ts`                 | Lists every folder.                                                                                                |
| `operations/delete.operation.ts`                  | Deletes the document, then the file and its variants.                                                              |
| `operations/regenerate.operation.ts`              | Brings stored variants in line with the image options.                                                             |
| `library/names.ts`                                | Filename and folder rules, storage keys, free names and MIME matching. Browser-safe.                               |
| `library/names-in.ts`                             | Names used by documents and unfinished uploads.                                                                    |
| `images/`                                         | Provider types, modifiers, variant selection, allowlist, `/img` path parsing and URL decoration.                   |
| `images/ipx.ts`, `images/cloudflare.ts`           | Providers; `integral-cms/media/ipx` and `integral-cms/media/cloudflare`.                                           |
| `variants/keys.ts`                                | Variant key layout and listing.                                                                                    |
| `variants/render-variants.ts`                     | Renders and stores one or many variants.                                                                           |
| `variants/move-variants.ts`, `delete-variants.ts` | Moves or deletes a file with its variants.                                                                         |
| `variants/remove-orphans.ts`                      | Deletes variants of files that no longer exist.                                                                    |
| `endpoints/routes.ts`                             | Mounts public reads and protected writes in order.                                                                 |
| `endpoints/*.endpoint.ts`                         | One Hono sub-app per capability.                                                                                   |
| `endpoints/serve-file.ts`                         | Document lookup by key, range responses and the sandbox headers of every served file.                              |
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
