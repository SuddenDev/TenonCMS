# media

The media library: uploads, the reserved `media` collection, storage adapters and image providers. On by default: an omitted `media` or `media: true` uses `default.ts`; `media: false` turns it off.

| Path                   | What it does                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`             | Export barrel for configuration, the reserved collection and the scoped API.                                                                               |
| `config/options.ts`    | Storage, limits, images and hook options.                                                                                                                  |
| `config/collection.ts` | The reserved media collection definition.                                                                                                                  |
| `api.ts`               | Binds upload, edit, folder, delete and regeneration methods to one scope.                                                                                  |
| `core.ts`              | `createMediaCore()` (defaults, preset checks, the `/img` allowlist), `mediaOf()`, `runMediaHooks()` (host hooks, then plugins'), `read()` (adds URLs).     |
| `upload.ts`            | The upload steps: `create()`, `putPart()`, `complete()`, `abort()`, cleanup of uploads older than a day, and `upload()` for the local API.                 |
| `library.ts`           | Changes to stored files: `update()` (alt edits and moves), `renameFolder()`, `removeMedia()`, `folders()`, `namesIn()`.                                    |
| `variants.ts`          | Everything under `.variants/`: `renderVariant()`, `renderAll()`, `moveWithVariants()`, `deleteWithVariants()`, `regenerate()`.                             |
| `names.ts`             | Filename and folder rules, `keyOf()`, `freeName()` (counters), `accepts()` (MIME wildcards). No core imports, so the admin bundles it.                     |
| `images.ts`            | `ImageProvider`, option merge, `variantsFor()` (`src` / `srcset`), `allowlist()`, `/img` path parsing, `decorate()` (the computed `url`, `src`, `srcset`). |
| `dimensions.ts`        | Width and height from the image header, through `image-size` (pure JS, no `node:fs`).                                                                      |
| `http.ts`              | The routes under `/api/cms/media`: uploads, `PATCH` / `DELETE /:id`, `folders`, `folders/rename` (session); `folders`, `files/*`, `img/*` (public).        |
| `storage/types.ts`     | The `Storage` adapter type.                                                                                                                                |
| `storage/local.ts`     | `local()`: files on disk, parts streamed through the server. Export `integral-cms/media/local`.                                                            |
| `default.ts`           | `defaultMedia()`: `local('./.uploads')` and `ipx({ prerender: true })`. Export `integral-cms/media/default`, which core imports itself.                    |
| `workerd.ts`           | Throwing `local()`, `ipx()` and `defaultMedia(true)` for Cloudflare Workers, by the `workerd` export condition.                                            |
| `storage/s3.ts`        | `s3()`: S3, R2 or MinIO through `aws4fetch`, parts straight from the browser. Export `integral-cms/media/s3`.                                              |
| `images/ipx.ts`        | `ipx()`: variants rendered by IPX and served by core. Export `integral-cms/media/ipx`.                                                                     |
| `images/cloudflare.ts` | `cloudflare()`: `/cdn-cgi/image` URLs. Export `integral-cms/media/cloudflare`.                                                                             |

The storage and provider files are their own package entries, so `node:fs`, `ipx` and `aws4fetch` never reach a bundle that does not import them.

Rules:

- Media documents change only through the media API. The local API's `create`, `update` and `delete` reject `media`, so the generic routes and `cms.create('media')` answer 400. Media code calls `write()` and `remove()` directly.
- Every operation writes storage first, then the database, then cleans storage up. A failure leaves at most a stray object, never a document without its file.
- `cms_uploads` holds uploads in progress: it reserves the key and binds the upload to its user.
- Media documents live in `cms_documents`. `cms_media_key_idx` keeps `key` unique; `/files` and `/img` look documents up with `mediaByKey()`, which uses it.
- Variants live under `.variants/<key>/<modifiers>`, so `storage.list('.variants/<key>/')` finds one file's variants. Only `variants.ts` knows this layout.
- `.variants` and `.tmp` are reserved folder names.
