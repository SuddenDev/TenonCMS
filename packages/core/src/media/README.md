# media

The media library: uploads, the reserved `media` collection, storage adapters and image providers. On by default: an omitted `media` or `media: true` uses `default.ts`; `media: false` turns it off.

| Path                                                        | What it does                                                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                                                  | Public configuration, reserved collection, storage/provider types, and scoped API exports.                                    |
| `config/`                                                   | Media options and the reserved collection definition.                                                                         |
| `api.ts`                                                    | Binds upload, edit, folder, delete, and regeneration methods to one scope.                                                    |
| `runtime/create-media-core.ts`                              | Resolves defaults, validates presets/providers, creates the image allowlist, and retrieves configured media.                  |
| `runtime/run-media-hooks.ts`                                | Runs host hooks, then plugin hooks in registration order.                                                                     |
| `runtime/read-media.ts`                                     | Decorates a media document using global image options.                                                                        |
| `operations/uploads/`                                       | Upload creation, part streaming, completion, abortion, local upload orchestration, ownership lookup, and upload data helpers. |
| `operations/`                                               | File updates/moves, folder rename/listing, deletion, and regeneration.                                                        |
| `library/names.ts`                                          | Filename/folder rules, storage keys, free names, and MIME matching. Browser-safe.                                             |
| `library/names-in.ts`                                       | Names reserved by documents and unfinished uploads.                                                                           |
| `images/`                                                   | Provider types, dimensions, modifier merging/IDs, variant selection, allowlist, path parsing, and URL decoration.             |
| `variants/`                                                 | Variant keys/listing, rendering, moving, and deletion.                                                                        |
| `endpoints/routes.ts`                                       | Mounts public reads and protected writes in their existing order.                                                             |
| `endpoints/*.endpoint.ts`                                   | Inline typed Hono routes grouped by media capability.                                                                         |
| `endpoints/get-file.ts`, `serve-file.ts`, `file-headers.ts` | Document lookup, file ranges, and sandbox response headers shared by file/image routes.                                       |
| `endpoints/request-context.ts`                              | Media body parsing and user scope.                                                                                            |
| `storage/types.ts`                                          | Storage adapter contract.                                                                                                     |
| `storage/local.ts`                                          | Local file/part streaming; `integral-cms/media/local`.                                                                        |
| `storage/s3.ts`                                             | S3, R2, or MinIO direct multipart uploads; `integral-cms/media/s3`.                                                           |
| `images/ipx.ts`                                             | IPX rendering; `integral-cms/media/ipx`.                                                                                      |
| `images/cloudflare.ts`                                      | Cloudflare image URLs; `integral-cms/media/cloudflare`.                                                                       |
| `default.ts`                                                | Local storage and prerendered IPX defaults; `integral-cms/media/default`.                                                     |
| `workerd.ts`                                                | Worker-specific errors for unsupported local/default/IPX providers.                                                           |

The storage and provider files are their own package entries, so `node:fs`, `ipx` and `aws4fetch` never reach a bundle that does not import them.

Rules:

- Media documents change only through the media API. The local API's `create`, `update` and `delete` reject `media`, so the generic routes and `cms.create('media')` answer 400. Media code calls `content/writes/write-document.ts` and `content/writes/remove-document.ts` directly.
- Storage creation/moves precede database writes and compensate on failure. Deletion commits the document and reference effects before storage cleanup.
- `cms_uploads` holds uploads in progress: it reserves the key and binds the upload to its user.
- Media documents live in `cms_documents`. `cms_media_key_idx` keeps `key` unique; `/files` and `/img` look documents up with `mediaByKey()`, which uses it.
- Variants live under `.variants/<key>/<modifiers>`, so `storage.list('.variants/<key>/')` finds one file's variants. `variants/keys.ts` owns the layout; regeneration uses it for orphan cleanup.
- `.variants` and `.tmp` are reserved folder names.

To follow an upload, start at `endpoints/uploads.endpoint.ts`, then `operations/uploads/create.operation.ts`, `put-part.operation.ts`, and `complete.operation.ts`. Completion assembles storage before validating the file, writes the document and runs hooks inside the database transaction, then prerenders variants. Direct upload-table SQL stays with these media operations during the structural migration.

To follow a move, start at `operations/update.operation.ts`: storage moves precede the document write, and a failed transaction moves the file back. Folder rename calls that operation once per document and reports partial failures.
