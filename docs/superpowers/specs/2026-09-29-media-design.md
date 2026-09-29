# Media

## Goal

Hosts upload files into a media library, organize them in folders, and reference them from content with `image` and `file` fields. Files live on the local disk or in S3 (any S3-compatible service, R2 included) through a storage adapter. Uploads up to 5 GB work on every host, because they are chunked and, with S3, go straight to the bucket. Images get responsive variants through an image provider modeled on Nuxt Image. Plugins listen to the file lifecycle through media hooks.

## Scope

In:

- `defineCms({ media })`: storage adapter, limits, image options, media hooks.
- Storage adapters `local()` and `s3()`.
- Image providers `ipx()` (on demand or prerendered, sharp through IPX) and `cloudflare()`; custom providers.
- Field types `image` and `file`.
- Chunked, resumable uploads; moves and renames that move the stored file; deletes.
- Media hooks for the host and for plugins.
- `client.media.upload()`, `cms.media.*` in the local API.
- Admin: Media page, file page, picker with upload for `image` / `file` fields.

Out (later):

- Private files and signed read URLs.
- Cropping, focal point, free `?width=` requests.
- Bulk select and move, search, an "unused files" view.
- Redirects for moved media URLs.
- A Nuxt Image / unpic provider for the host site.

## Code layout

- `packages/core/src/media/`: everything media at runtime. `index.ts` (options, the media API bound into `Core`), `upload.ts` (create, parts, complete, abort, cleanup), `move.ts`, `names.ts` (filename and folder rules, collisions), `images.ts` (option merge, `srcset`, allowlist, `/img` URL parsing), `dimensions.ts` (header parsing), `http.ts` (the media routes), `README.md`.
- `src/media/storage/local.ts`, `src/media/storage/s3.ts`: storage adapters.
- `src/media/images/ipx.ts`, `src/media/images/cloudflare.ts`: image providers.
- `src/schema/fields/image.ts`, `src/schema/fields/file.ts`: field option types and validators, like the other fields.
- Package exports: `integral-cms/media/local`, `integral-cms/media/s3`, `integral-cms/media/ipx`, `integral-cms/media/cloudflare`. Each is its own entry, so `node:fs` and `ipx` never reach a Workers bundle.
- Optional peers: `aws4fetch` (s3), `ipx` (ipx). `image-size` (pure JS header parsing) becomes a core dependency, unless a hand-written parser for PNG, JPEG, GIF, WebP, AVIF and SVG stays under ~150 lines.

## Config

```ts
import { defineCms } from "integral-cms";
import { local } from "integral-cms/media/local";
import { ipx } from "integral-cms/media/ipx";

export default defineCms({
  // ...
  media: {
    storage: local({ dir: "./uploads" }),
    maxSize: 5 * 1024 ** 3,
    accept: ["image/*", "video/*", "application/pdf"],
    images: {
      provider: ipx(),
      format: "webp",
      quality: 80,
      sizes: [320, 640, 1024, 1536, 1920],
      presets: {
        avatar: { width: 128, height: 128, fit: "cover" },
        og: { width: 1200, height: 630, fit: "cover", format: "jpeg", quality: 85 },
      },
      maxSize: 50 * 1024 ** 2,
    },
    hooks: { afterUpload: [scan] },
  },
});
```

| option                            | default                        | meaning                                          |
| --------------------------------- | ------------------------------ | ------------------------------------------------ |
| `storage`                         | required                       | a storage adapter                                |
| `maxSize`                         | 100 MB                         | largest accepted file                            |
| `accept`                          | all types                      | allowed MIME types, `type/*` wildcards           |
| `images`                          | `false`                        | image options, or `false` for originals only     |
| `images.provider`                 | required when `images` is set  | an image provider                                |
| `images.format`, `images.quality` | `'webp'`, `80`                 | default modifiers                                |
| `images.sizes`                    | `[320, 640, 1024, 1536, 1920]` | widths for `srcset`                              |
| `images.presets`                  | `{}`                           | named modifier sets                              |
| `images.maxSize`                  | 50 MB                          | images above this get dimensions but no variants |
| `hooks`                           | none                           | media hooks, see below                           |

Without `media`, core adds nothing: no collection, no routes, no table use. A schema with an `image` or `file` field then throws at startup.

`media` is a reserved collection name and route prefix. A host collection or plugin named `media` throws at startup.

Every option gets JSDoc on its property.

## Data

Files are documents of the reserved collection `media`, stored in `cms_documents` like other documents, so relations, populate and `onDelete` work unchanged.

| field             | example                   | notes                                                               |
| ----------------- | ------------------------- | ------------------------------------------------------------------- |
| `folder`          | `blog/2026`               | `''` is the root. Filterable                                        |
| `filename`        | `hero.jpg`                | unique within its folder, case-insensitive                          |
| `key`             | `blog/2026/hero.jpg`      | always `folder/filename` (just `filename` at the root). Set by core |
| `mimeType`        | `image/jpeg`              |                                                                     |
| `size`            | `482113`                  | bytes, measured by core                                             |
| `width`, `height` | `1920`, `1080`            | images only, read by core from the file header                      |
| `alt`             | `Sunset over the harbour` | editable                                                            |

`url` (the original), and for images `src` and `srcset`, are computed on read and never stored.

Media documents are written only through the media API (`cms.media.*` and the media routes). `cms.create/update/delete('media', …)` and the generic write routes reject `media` with 400. Reads use the normal `find('media', …)` and `collections/media` routes. Collection and root hooks do not run for `media`; media hooks do.

### Folders

A folder is the `folder` string of its files. There are no folder records. The folder list is the set of distinct `folder` values plus their parents. A folder exists while it holds a file. "New folder" in the admin opens an empty folder that exists only in the admin until the first upload.

Storage mirrors folders: the file of `blog/2026/hero.jpg` is `<dir>/blog/2026/hero.jpg` on disk and has the key `blog/2026/hero.jpg` in S3. Files on disk are normal, usable files.

### Uploads in progress

New core table `cms_uploads`, added as a new migration key in `db/index.ts`:

`id, key, folder, filename, mimeType, size, partSize, adapterUploadId, userId, createdAt`

It reserves the key at create, binds the upload to its user, and drives cleanup.

### Variants

Rendered variants live in storage under `.variants/<modifiers>/<key>`, for example `.variants/w_640&f_webp&q_80/blog/2026/hero.jpg`. `.variants` is a reserved folder name. Moves and deletes take a file's variants along.

## Storage adapter

```ts
type Storage = {
  /** Default part size in bytes. */
  partSize: number;
  createUpload(
    key: string,
    info: { size: number; mimeType: string; parts: number },
  ): Promise<{ uploadId: string }>;
  /** Direct uploads (S3): a presigned URL the browser PUTs part `n` to. */
  partUrl?(key: string, uploadId: string, n: number, expiresIn: number): Promise<string>;
  /** Proxied uploads (local): core streams part `n` into the adapter. */
  putPart?(
    key: string,
    uploadId: string,
    n: number,
    body: ReadableStream,
    maxBytes: number,
  ): Promise<{ etag: string }>;
  complete(
    key: string,
    uploadId: string,
    parts: { n: number; etag: string }[],
  ): Promise<{ size: number }>;
  abort(key: string, uploadId: string): Promise<void>;
  get(
    key: string,
    range?: { start: number; end: number },
  ): Promise<{ body: ReadableStream; size: number } | undefined>;
  put(key: string, data: Uint8Array, mimeType: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  delete(key: string): Promise<void>;
  url(key: string): string;
};
```

An adapter implements exactly one of `partUrl` and `putPart`.

### `local({ dir, partSize = 16 MB, baseUrl? })`

- `createUpload` creates `<dir>/.tmp/<uploadId>`.
- `putPart` streams the body into that file at offset `(n - 1) * partSize` with `Readable.fromWeb()` and `fs.createWriteStream(file, { flags: 'r+', start })`. It counts bytes and stops at `maxBytes`. Parts MAY arrive out of order or twice.
- `complete` checks the file size, creates the parent directories and renames the file to `<dir>/<key>`.
- `move` is `fs.rename`; `delete` removes the file and prunes empty parent directories.
- `url(key)` is `/api/cms/media/files/<key>`, or `<baseUrl>/<key>` when the host serves `dir` itself.
- Needs a persistent disk (Node, Bun, Deno). Not for Workers or ephemeral serverless filesystems; documented.

### `s3({ bucket, region, endpoint?, accessKeyId, secretAccessKey, publicUrl, partSize = 16 MB })`

- Signs with `aws4fetch`, so it runs on Node and on Workers.
- `createUpload` is `CreateMultipartUpload`; `partUrl` presigns `UploadPart`; `complete` is `CompleteMultipartUpload`, then `HeadObject` for the real size; `abort` is `AbortMultipartUpload`.
- `move` is `CopyObject` then `DeleteObject`, and a multipart copy (`UploadPartCopy`) above 5 GB.
- `url(key)` is `<publicUrl>/<key>`.
- Documented bucket setup: CORS allowing `PUT` from the admin origin and exposing `ETag`; a lifecycle rule that aborts incomplete multipart uploads after one day. R2: `region: 'auto'`, `endpoint: https://<account>.r2.cloudflarestorage.com`.

### Part size

The effective part size is the adapter's `partSize`, raised until `size / partSize <= 10000`, and at least 5 MB for `s3()`.

## Uploads

Routes are under `/api/cms/media` and need a session, except where noted.

1. `POST /uploads` with `{ folder, filename, mimeType, size }`.
   - Core cleans `folder` and `filename`, checks `size` against `maxSize` and `mimeType` against `accept`, and runs `beforeUpload`.
   - It picks a free key (`hero.jpg`, then `hero-1.jpg`, …) against stored media and `cms_uploads`, calls `createUpload` and inserts the `cms_uploads` row.
   - Response: `{ id, partSize, parts: [{ n, url }] }`. With `partUrl`, the URLs are presigned for 24 h. With `putPart`, they point to the route in step 2.
2. The client PUTs each part to its URL, 3–4 at a time, retrying a failed part 3 times with backoff.
   - Proxied: `PUT /uploads/:id/parts/:n` streams the body into `putPart` with `maxBytes = partSize`. Response `{ etag }`.
   - Direct: the client reads `ETag` from the S3 response.
3. `POST /uploads/:id/complete` with `{ parts: [{ n, etag }] }`.
   - `complete`, then the size check, then for `image/*` the header read for `width` and `height`.
   - In one transaction: create the media document, run `afterUpload`, delete the `cms_uploads` row.
   - After commit: with `images.provider.prerender`, render every allowed variant. Failures are logged; the variant is rendered on first request instead.
   - Response: the media document.
4. `DELETE /uploads/:id` aborts: `abort`, then the row is deleted.

Cleanup: on each create, uploads older than 24 h are aborted and their rows deleted.

The client: `client.media.upload(file, { folder, onProgress, signal })` runs steps 1–4 and returns the media document. Progress is reported per finished part. `signal` aborts. The admin uses it; host sites MAY use it too.

The local API: `cms.media.upload(data, { folder, filename, mimeType })` with `data` a `Uint8Array` or `ReadableStream`, for seeding, imports and tests. It goes through the same steps without HTTP.

## Moves, renames and deletes

- `PATCH /api/cms/media/:id` with any of `{ alt, filename, folder }`; `cms.media.update(id, data)`.
  - `alt` alone is a metadata change: `beforeChange`, write, `afterChange`.
  - A new `filename` or `folder` is a move: clean the name, check the target key is free (400 `Already used` on `filename`; renames never auto-suffix), `beforeMove`, `storage.move` for the file and its variants, update the document in a transaction, `afterMove`, then delete old objects where `move` copied.
  - If the document update fails, the file is moved back. If that fails too, it is logged as an error with both keys.
- `POST /api/cms/media/folders/rename` with `{ from, to }`; `cms.media.renameFolder(from, to)`. Moves every file under `from`, one by one, as above. Moving a folder into its own subfolder is a 400. Response: `{ moved, failed: [{ id, message }] }`. Running it again finishes a partial rename.
- `DELETE /api/cms/media/:id`; `cms.media.delete(id)`. `beforeDelete`, the document delete with the usual `onDelete` rules (a `restrict` reference is 409 with `references`), commit, then `storage.delete` for the file and its variants, then `afterDelete`. A failed storage delete is logged; the delete still succeeds.
- `GET /api/cms/media/folders` (public): the folder list.

Order rule for every operation: storage write first, then the database, then storage cleanup. A failure leaves at most a stray object in storage, never a document pointing to a missing file.

## Serving

- `GET /api/cms/media/files/<key>` (public): streams the original from `storage.get`. Supports `Range` (206; 416 for a bad range). Headers: `Content-Type`, `Content-Length`, `Accept-Ranges`, `X-Content-Type-Options: nosniff`. No `immutable` caching, because keys change on move. Used by `local()` without `baseUrl`; `s3()` URLs point to the bucket.
- `GET /api/cms/media/img/<modifiers>/<key>` (public), when the provider has `render`:
  - `<modifiers>` uses IPX syntax (`w_640&f_webp&q_80`). A combination outside the allowlist is 400. An unknown key or a non-image is 404.
  - Served from `.variants/<modifiers>/<key>` when present. Otherwise core calls `provider.render(key, modifiers)`, stores the result and serves it.
  - A render failure is 500, logged, nothing stored.

## Images

### Modifiers and options

Modifiers follow Nuxt Image: `width`, `height`, `fit`, `format`, `quality`, `background`, `blur`. A provider MAY accept more.

The modifiers of one image read merge in this order: `images.format` / `images.quality`, then the field's `preset`, then the field's own modifiers. Widths come from the field's `sizes`, else `images.sizes`. Widths at or above the original's width are dropped. A preset with a fixed `width` and no field `sizes` gives `1x` / `2x` densities instead.

### Allowlist

At startup core builds every modifier combination the config can produce: global options and each preset, crossed with every `image` field's options, crossed with its widths, plus the admin thumbnail (`width: 256`). The `/img` route accepts only these.

### Provider

```ts
type ImageProvider = {
  /** Builds the URL of one variant. Runs on the server during reads. Same idea as Nuxt Image's `getImage`. */
  getImage(
    src: { key: string; url: string; width: number; height: number },
    modifiers: Modifiers,
  ): { url: string };
  /** For providers core serves at `/api/cms/media/img`. Returns the rendered bytes. */
  render?(key: string, modifiers: Modifiers): Promise<{ data: Uint8Array; mimeType: string }>;
  /** Render all allowed variants after upload instead of on first request. Needs `render`. */
  prerender?: boolean;
};
```

- `ipx({ prerender? })`: `getImage` returns `/api/cms/media/img/<modifiers>/<key>`. `render` calls IPX's programmatic API, `ipx(key, modifiers).process()`, with an IPX storage (`getMeta`, `getData`) that reads through `storage.get`. It does not use `createIPXWebServer`, whose path handling breaks under a mount prefix (unjs/ipx#239). The IPX version is pinned in the plan.
- `cloudflare()`: `getImage` returns `/cdn-cgi/image/<options>/<url>`. No `render`.
- Custom: any object of this shape, for example imgproxy, Bunny or Vercel URLs, or a `render` with another library.

With `images: false`, or for images above `images.maxSize`, `src` is the original URL and `srcset` is empty.

## Fields

```ts
hero: { type: 'image', required: true, image: { sizes: [800, 1600, 2400], quality: 70 } },
avatar: { type: 'image', maxSize: 2 * 1024 ** 2, image: { preset: 'avatar' } },
gallery: { type: 'image', many: true },
attachments: { type: 'file', many: true, accept: ['application/pdf'] },
download: { type: 'file', folder: 'downloads' },
```

| option     | `image`           | `file`   | notes                                                                    |
| ---------- | ----------------- | -------- | ------------------------------------------------------------------------ |
| `many`     | yes               | yes      | array of ids                                                             |
| `accept`   | narrows `image/*` | any list | checked on write against the media document's `mimeType`                 |
| `maxSize`  | yes               | yes      | narrows `media.maxSize`; checked on write and in the admin before upload |
| `folder`   | yes               | yes      | default folder for "Upload new" in the admin                             |
| `image`    | yes               | no       | `preset`, modifiers, `sizes`                                             |
| `onDelete` | yes               | yes      | default `'restrict'`; `'set-null'` allowed; `'cascade'` not allowed      |

- Stored like a relation: the media id, or an id array with `many`.
- A helper `targetOf(field)` returns `'media'` for `image` and `file` and `field.collection` for `relation`. `checkRefs`, `populate`, `onDelete`, `step()`, `relationPaths()`, `innerFields()`, filters, `select` and the read types use it, so there is no second copy of the relation logic.
- `checkRefs` also checks `accept` and `maxSize` against the referenced document (400 on the field path).
- `relation` with `collection: 'media'` is rejected at startup.
- Populated types: `image` reads as `Image` (`id`, `url`, `src`, `srcset`, `width`, `height`, `alt`, `mimeType`, `size`, `folder`, `filename`, `key`), `file` as `File` (without `src`, `srcset`, `width`, `height`). Unpopulated, both are ids. `image` options on a `file` field are a type error.
- `src` and `srcset` are computed per field during populate, from that field's `image` options.
- `schema` over HTTP sends the field options, so the admin can check `accept` and `maxSize` and show the picker.

## Media hooks

Set in `media.hooks` and on plugins as `mediaHooks`. Order per stage: `media.hooks`, then each plugin's `mediaHooks` in `plugins` order. Every stage is a `Slot` (array or named record), like other hooks. Hooks get `cms` and `user` like other hooks and run inside the operation's transaction, except where noted.

| stage                          | when                                    | gets                                     | can                                                                                         |
| ------------------------------ | --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `beforeUpload`                 | create, before any bytes                | `folder`, `filename`, `mimeType`, `size` | return changed `folder` / `filename`; throw to reject                                       |
| `afterUpload`                  | complete, file stored, document created | `doc`, `read()` (stream of the file)     | update the document; throw to delete document and file                                      |
| `beforeChange` / `afterChange` | `alt` edits                             | `data` / `doc`                           | change data; react                                                                          |
| `beforeMove` / `afterMove`     | filename or folder change               | `doc`, `from`, `to`                      | throw to block; react (CDN purge)                                                           |
| `beforeDelete` / `afterDelete` | delete                                  | `doc`                                    | throw to block; react. `afterDelete` runs after the storage delete, outside the transaction |

`read()` downloads from storage, so with S3 it costs a GET.

## Errors and limits

Errors use the existing `onError`: 400 `{ message, errors }`, 409 `{ message, references }`, other errors 500 without internals.

| where    | failure                                                             | result                                        |
| -------- | ------------------------------------------------------------------- | --------------------------------------------- |
| create   | `size` > `maxSize`, type not in `accept`, bad `folder` / `filename` | 400, keyed by field                           |
| create   | `beforeUpload` throws                                               | its error; nothing reserved                   |
| part     | unknown or expired upload, or another user's                        | 404                                           |
| part     | `n` out of range, body larger than `partSize`                       | 400; the local write stops at the limit       |
| complete | real size differs from `size`                                       | file deleted, 400                             |
| complete | `image/*` whose header cannot be read                               | file deleted, 400 `Not a valid image`         |
| complete | a part without `ETag` (S3)                                          | 400 naming the bucket CORS setting            |
| complete | `afterUpload` throws                                                | document rolled back, file deleted, its error |
| complete | prerender fails                                                     | logged; the upload succeeds                   |
| move     | target key taken                                                    | 400 `Already used` on `filename`              |
| move     | folder into its own subfolder                                       | 400                                           |
| move     | `storage.move` fails                                                | nothing changes, 500                          |
| delete   | `restrict` reference                                                | 409 with `references`                         |
| delete   | storage delete fails                                                | logged; the delete succeeds                   |
| serve    | unknown key                                                         | 404                                           |
| serve    | modifiers outside the allowlist                                     | 400                                           |
| serve    | bad `Range`                                                         | 416                                           |

Name rules (`names.ts`): Unicode NFC; `/`, `\`, control characters and leading dots removed; at most 200 characters per segment; no `.` or `..` segments; `.variants` and `.tmp` reserved; collisions compared case-insensitively.

Known limit: two concurrent moves of the same file are not locked. It gets a `ponytail:` comment.

## Admin

Plain Vue SFCs with Tailwind. New shadcn-vue components through the CLI: `dialog`, `progress`, `breadcrumb`, `input`, `label`, `dropdown-menu`, `alert-dialog`. The admin uses `client.media.upload()` from core's client.

- Sidebar: "Media", order 15, shown when `schema` has media.
- Media page:
  - A folder tree from `GET /media/folders`.
  - Breadcrumbs for the open folder; "New folder" (name prompt, opens the empty folder); "Upload" (file input, `multiple`); drag and drop onto the grid.
  - A grid: images as thumbnails (the admin thumbnail variant, or the original scaled by CSS without a provider), other files as a type icon with name and size.
  - An upload list: progress, cancel, error message per file.
  - Folder actions: rename (shows `failed` entries).
- File page: preview (`<img>`, `<video>`, `<audio>`, or a download link); editable `alt`, `filename`, `folder` (select from the tree, or a new path); read-only type, size, dimensions, URL with copy; delete through `alert-dialog`, a 409 lists the referencing documents with links.
- `image` / `file` input in `FieldInput.vue`: the selection as thumbnails or icon with name, remove per item, ↑ / ↓ for `many`. "Choose" opens a `dialog` with the library in picker mode (single or multi by `many`; files outside `accept` / `maxSize` disabled; opens in the field's `folder`). "Upload new" inside the dialog and next to "Choose" uploads into the open folder and selects the result.

## Testing

TDD, red first.

Unit tests next to the code:

- `names.test.ts`: cleaning, reserved names, case-insensitive collisions, suffixes.
- `images.test.ts`: option merge, `srcset` without upscaling, densities, allowlist, `/img` URL parsing.
- `upload.test.ts`: the part size math.
- `dimensions.test.ts`: tiny PNG, JPEG, GIF, WebP fixtures; a broken header.
- `storage/local.test.ts` (temp dir): out-of-order and repeated parts, a too-large part stops mid-stream, `complete`, ranged `get`, `move`, `delete`, cleanup with fake timers.
- `storage/s3.test.ts` (recording fake `fetch`): create, presigned part URLs, complete body, missing `ETag`, `move` as copy and delete, multipart copy above 5 GB.
- `images/cloudflare.test.ts`, `images/ipx.test.ts` (a real 1×1 PNG rendered to WebP; `ipx` as a dev dependency).
- `types.test.ts`: `Image` / `File` read types, ids unpopulated, `select` / `populate` paths, `image` options on `file` rejected.

Integration, `src/tests/media.test.ts`: `defineCms()` on `:memory:` with `local()` in a temp dir and a small `partSize`, through `client.media.upload`:

- a multi-part upload with progress; the stored file is byte-identical; the document is right
- rejections: `maxSize` (global and field), `accept`, `beforeUpload`, another user's part, size mismatch, a fake image
- `afterUpload` throwing leaves no document and no file; hook order host then plugins; `beforeMove` / `beforeDelete` block
- field writes: unknown id, non-image in `image`, over the field's `maxSize`
- populated reads: `src` / `srcset` per field
- `/files` 200, 206, 416; `/img` 400 outside the allowlist; first request renders and stores, second is served from `.variants` (spy provider)
- moves: file and variants move on disk, `url` changes, collision 400, folder rename, a forced storage failure in `failed`
- deletes: `restrict` 409, `set-null`, file and variants removed
- an abandoned upload is cleaned up after 24 h
- without `media`: media routes 404; an `image` field throws at startup

Not automated:

- Real S3: a test that runs only with `S3_TEST_*` env vars; the docs give a MinIO `docker run` line.
- The admin: checked in the browser (upload with progress, picker, move, delete with 409).
- The standalone example gets `media` with `local()` and `ipx()`; the CLAUDE.md smoke test gets an upload step (create, one part, complete, fetch `/files/…` and `/img/…`).
- One manual 1 GB upload against `local()` and MinIO before calling it done.

## Docs

- `README.md`: a Media section (config, fields, providers, S3 bucket setup, local disk requirements, reverse proxy body limit vs `partSize`), and the roadmap item marked done.
- `CLAUDE.md`: the `src/media/` layout, the new exports, the `cms_uploads` table, the storage-first order rule.
- `src/media/README.md` and the `src/README.md` entry.
