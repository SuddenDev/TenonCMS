# Plan: Media

Spec: `docs/superpowers/specs/2026-09-29-media-design.md`.

All paths are relative to `packages/core` unless noted. Commands:

- One test: `npx vitest run <file> -t '<name>'` in `packages/core`. No build needed.
- Types: `pnpm -r typecheck` while a watcher runs, else `pnpm typecheck`. An unused `@ts-expect-error` is an error, so a type test is RED while the line compiles.
- Before done: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` (tsdown d.ts runs out of memory on bad read types; see CLAUDE.md).

Every task is RED then GREEN: write the listed tests, run them, see them fail for the right reason, then write the least code that passes.

## Starting point

- `relation` is handled in: `schema/fields/{relation,index}.ts`, `schema/validate.ts` (target exists, joins, `uniqueTypes`), `schema/walk.ts` (`relationPaths`, `innerFields`, `filterable`), `schema/types.ts` (`FieldValue`, `CheckRefs`, `Value`, `Select`, populate paths), `cms/populate.ts` (`populate()`, `step()`), `cms/refs.ts` (`checkRefs`, `references`, `onDelete`), `db/documents.ts` (`byIds`, `joinedDocs`, `referencingDocs`), admin `FieldInput.vue` and `DocForm.vue`.
- `src/tests/setup.ts` and `fields.test.ts`, `populate.test.ts`, `on-delete.test.ts` use a host collection named `media`. That name becomes reserved.
- Migrations: only `001_cms_tables` in `db/index.ts`.
- Reserved plugin names: `auth`, `collections`, `globals`, `schema` in `plugins/index.ts`.
- `Core` in `cms/scope.ts` holds `schema`, `plugins`, `rootHooks`, `defaults`, `db`, `bind`.

## Decisions

- **`isRef(field)` and `targetOf(field)`** in `schema/walk.ts`: `isRef` is true for `relation`, `image`, `file`; `targetOf` returns `'media'` for `image` / `file`, else `field.collection`. Every runtime `field.type === "relation"` branch listed above switches to `isRef`, every `field.collection` on a relation to `targetOf`. Joins keep `field.collection`.
- **Types: `image` / `file` are leaves.** A populated `image` is the fixed type `Image`, a `file` is `File`. They do not recurse into the media collection's fields, so `CheckRefs`, `Resolve` and the TS2589 guards are untouched. `populate` / `select` accept `true` on them, nothing deeper. `Value` gets one branch: `Off<S> extends true ? Ids<F> : Image | Image[]` (or `File`).
- **The `media` collection** is a plain `Collection` built in `media/index.ts` (`mediaCollection`), merged into `schema.collections` by `defineCms()` when `media` is set, after `mergePlugins()` and before `checkSchema()`. A host or plugin collection named `media` throws in `mergePlugins()`.
- **`Core.media`** is `MediaCore | undefined`: the resolved options, the storage, the provider, the allowlist, and `mediaSlot(stage)` (host hooks then plugins' `mediaHooks`). All media code takes `core` first, like the rest of `cms/`.
- **Guarding generic writes:** `write()` and `remove()` in `cms/write.ts` throw `ValidationError` for `col('media')` unless `scope.media === true`. The media API sets that flag on its inner scope. `slot()` returns `[]` for `media`, so collection and root hooks never run for it.
- **Computed fields** (`url`, `src`, `srcset`) are added by `decorate(core, doc, imageOptions)` in `media/images.ts`. `readDocs()` calls it for `find('media')` with the global options; `populate()` calls it per `image` / `file` field with that field's options. `pick()` runs after, so `select` still works.
- **Header parsing:** start with `image-size`. If its ESM build pulls `node:fs` into the core barrel, write `dimensions.ts` by hand (PNG, JPEG, GIF, WebP, AVIF, SVG) instead. Decide in Task 3 by checking `pnpm build` output for `node:fs` in `dist/index.mjs`.

## Task 0: Free the `media` name and add dependencies

- Rename the test collection `media` to `assets` in `src/tests/setup.ts` and every test that uses it (`fields.test.ts` has its own local `media`, rename to `videos`). Run `pnpm test`: all green, no behavior change.
- `pnpm --filter integral-cms add aws4fetch ipx -D`, then list both under `peerDependencies` with `peerDependenciesMeta.optional`. `image-size` waits for Task 3.
- Check the IPX major version: confirm `createIPX`, `ipx(id, modifiers).process()` and the `IPXStorage` shape (`getMeta`, `getData`) in the installed version. Note the version here.
- Note: IPX `4.0.0-beta.1` (the npm `latest` tag). `createIPX({ storage })`, `ipx(id, modifiers).process()` and `IPXStorage` (`name`, `getMeta`, `getData`) match. Pinned as dev dependency; peer range `^4.0.0-beta.1`.

## Task 1: `media/names.ts`

Tests `media/names.test.ts`:

- `cleanName('Héllo Wörld.JPG')` is NFC, keeps the extension; `/`, `\`, control characters and leading dots are removed; 200 characters max.
- `cleanFolder('a//b/../c')` throws; `.`, `..`, `.variants`, `.tmp` segments throw; `''` is the root.
- `keyOf(folder, filename)`: `'hero.jpg'` at the root, `'a/b/hero.jpg'` else.
- `freeName(taken, 'hero.jpg')`: `hero.jpg`, then `hero-1.jpg`, `hero-2.jpg`; `taken` compared lowercase, so `Hero.JPG` counts.
- Note: `accepts()` (MIME wildcards) lives here too, so `cms/refs.ts` and the admin import it without an import cycle through `media/index.ts`.

## Task 2: `media/images.ts` (pure part)

Tests `media/images.test.ts`:

- `modifiersFor(images, field)`: merge `format` / `quality`, then `preset`, then the field's own modifiers.
- `widthsFor(images, field, original)`: field `sizes`, else global `sizes`; drops widths `>=` the original.
- `srcsetFor(...)`: `w` descriptors; a fixed-width preset without `sizes` gives `1x` / `2x`.
- `allowlist(images, fields)`: every combination of global options, presets and each `image` field's options × widths, plus the admin thumbnail `{ width: 256 }`. Stable string form: IPX syntax with keys sorted (`f_webp&q_80&w_640`).
- `parseImgPath('w_640&f_webp&q_80/blog/hero.jpg')` returns `{ modifiers, key }`; the modifiers string is normalized to the sorted form before the allowlist check.

## Task 3: `media/dimensions.ts`

Tests `media/dimensions.test.ts` with inline byte fixtures (1×1 PNG, 3×2 JPEG, GIF, WebP, SVG with `width`/`height`): `dimensions(bytes, mimeType)` returns `{ width, height }`; broken bytes return `undefined`. Needs at most the first 64 KB. Make the `image-size` decision from the Decisions section here.

- Note: `image-size` it is. Its main entry has no `node:fs` (only `image-size/fromFile` does); `dist/index.mjs` imports neither `node:fs`, `ipx` nor `aws4fetch`. `dimensions(bytes)` takes no MIME type; the caller checks `image/*`. `complete()` reads the first 1 MB, not 64 KB, because some JPEGs carry large metadata before the size.

## Task 4: `Storage` type and `local()`

Files: `media/storage/types.ts` (the `Storage` type from the spec, exported), `media/storage/local.ts`.

Tests `media/storage/local.test.ts` (temp dir from `fs.mkdtemp`):

- `createUpload` then `putPart` for parts 3, 1, 2 out of order, part 2 twice; `complete` gives a file equal to the input, at `<dir>/<key>`, parent directories created.
- A part body over `maxBytes` rejects mid-stream and writes at most `maxBytes`.
- `get(key, { start, end })` streams the range; `get` of a missing key is `undefined`.
- `move` renames and creates parents; `delete` removes the file and prunes empty parent directories up to `dir`.
- `cleanup(olderThan)` removes `.tmp` files older than 24 h (`vi.setSystemTime`).
- `url(key)` is `/api/cms/media/files/<key>`, or `<baseUrl>/<key>`; key segments are URI-encoded.
- Note: no `cleanup(olderThan)` on `local()`. Core aborts rows older than 24 h through `storage.abort()`, which covers it; a `.tmp` file orphaned by a crash between `createUpload` and the row insert stays. `putPart` writes part `n` at `(n - 1) * maxBytes` (`maxBytes` is the upload's part size); core counts the bytes and rejects a part of the wrong length. Moving or deleting a missing key is a no-op in both adapters, so moves and deletes can try every allowed variant key.

## Task 5: `s3()`

File `media/storage/s3.ts`, using `AwsClient` from `aws4fetch`. Takes an optional `fetch` for tests.

Tests `media/storage/s3.test.ts` with a recording fake `fetch` that returns canned XML:

- `createUpload` sends `POST ?uploads` and returns the `UploadId`.
- `partUrl` returns a URL with `partNumber`, `uploadId`, `X-Amz-Signature`, `X-Amz-Expires`.
- `complete` sends the `CompleteMultipartUpload` XML with parts sorted by `n`, then `HEAD` for the size.
- A part with an empty `etag` throws the CORS message before any request.
- `move` sends `PUT` with `x-amz-copy-source`, then `DELETE`; above 5 GB it uses `UploadPartCopy` parts.
- R2: `region: 'auto'` and `endpoint` produce path-style URLs on that endpoint.
- Note: `AwsClient.fetch` always uses the global `fetch`, so the adapter signs with `client.sign()` and sends through its own `fetch` option. `s3()` raises its own `partSize` to 5 MB; `effectivePartSize(size, partSize)` has no `min` argument.

## Task 6: Field types `image` and `file`

Files: `schema/fields/image.ts`, `schema/fields/file.ts` (option types with JSDoc, zod: id or id array like `relationSchema`), `schema/fields/index.ts` (union, `fieldSchema` dispatch), `schema/walk.ts` (`isRef`, `targetOf`, use them in `relationPaths`, `innerFields`, `filterable`), `schema/validate.ts`.

Tests:

- `validate.test.ts`: an `image` field without `media` configured throws; `relation` with `collection: 'media'` throws; `onDelete: 'cascade'` on `image` throws; `unique` on `image` allowed like a single relation.
- `walk.test.ts` (or existing tests of `relationPaths`): `image` / `file` at the top level and in groups are found with target `media`.
- `types.test.ts`: `Data` has `string` / `string[]`; a populated read has `Image` / `File`; `populate: { hero: true }` is valid, `populate: { hero: { alt: true } }` is `@ts-expect-error`; `select: { hero: true }` valid; `image: { preset }` on a `file` field is `@ts-expect-error` with `satisfies Fields`.
- Then `pnpm build` once: tsdown d.ts must still finish.
- Note: `image` / `file` are leaves at runtime too: `innerFields()` returns `undefined`, and `badPopulatePath()` accepts them as the last segment. `onDelete: 'cascade'` is a type error on them and throws in `checkSchema()`.

## Task 7: `media` option, `Core.media`, table, guards

Files: `media/index.ts` (`MediaOptions` with JSDoc, `mediaCollection`, `createMediaCore()`), `cms/options.ts` (`media?: MediaOptions`), `cms/index.ts` (merge the collection, build `core.media`), `cms/scope.ts` (`Core.media`, `Scope.media`, `slot()` returns `[]` for `media`, `mediaSlot()`), `plugins/index.ts` (`mediaHooks?: MediaHooks`, `media` reserved as plugin and collection name), `db/index.ts` (`002_cms_uploads` migration, `cms_uploads` in `Database`), `cms/write.ts` (the guard).

Tests (new `src/tests/media.test.ts`, with a `media()` helper in `setup.ts`: `fresh()` plus `media: { storage: local({ dir: tmp, partSize: 1024 }) }`):

- `cms.create('media', …)`, `update`, `delete` reject with 400; `POST /collections/media` is 400.
- `find('media')` works and returns `[]`.
- A root `beforeRead` hook is not called for `media`.
- `defineCms` with a host collection `media` and `media` set throws; a plugin named `media` throws.
- `db/index.test.ts`: `cms_uploads` exists after migrate.
- Note: the guard is a `media: true` option of `write()` / `remove()`, not `scope.media`: `inner()` copies the scope into hooks, so a scope flag would let a hook's `cms.create('media')` through. `media` is reserved always, not only with `media` set. `cms_uploads` columns are snake_case like the other tables. `find('media')` is typed with the media fields; `url` / `src` / `srcset` are there at runtime but not in its type.

## Task 8: Uploads in the local API

Files: `media/upload.ts` (`create`, `putPart`, `complete`, `abort`, `cleanup`), `media/index.ts` (`cms.media.upload(data, { folder, filename, mimeType })` built from those), `cms/api.ts` (add `media` to the bound API when `core.media` is set), `schema/hooks/` (a `media.ts` with `MediaHooks` types).

Tests in `src/tests/media.test.ts` (local API, no HTTP yet):

- Upload 3 KB with `partSize: 1024`: the document has `folder`, `filename`, `key`, `mimeType`, `size`; the file on disk is byte-identical.
- Upload a PNG fixture: `width` / `height` from the header.
- Same name twice: `hero.jpg`, `hero-1.jpg`, also while the first is still in `cms_uploads`.
- `maxSize`, `accept`, bad folder: 400 keyed by field.
- A fake image (`image/png` with text bytes): 400 `Not a valid image`, no file left.
- `beforeUpload` can rename, and its throw rejects with nothing reserved.
- `afterUpload` gets `read()` with the bytes; its throw leaves no document and no file.
- Hook order: `media.hooks` first, then plugins' `mediaHooks` in `plugins` order.
- `cleanup`: an upload row older than 24 h (fake timers) is aborted and deleted on the next create.
- Part size math: `effectivePartSize(size, partSize, min)` unit tests in `media/upload.test.ts`.
- Note: the reservation and 24 h cleanup tests need an unfinished upload, so they run over HTTP in Task 9. `size` is required when `data` is a stream. `beforeUpload` gets `data` (like other hooks); `afterUpload` returns nothing and changes the document through `cms.media.update()` (`LocalApi.media` is optional).

## Task 9: HTTP routes and `client.media.upload`

Files: `media/http.ts` (routes, mounted from `http/index.ts` only when `cms.media` exists: `POST /uploads`, `PUT /uploads/:id/parts/:n`, `POST /uploads/:id/complete`, `DELETE /uploads/:id` in `writes`; `GET /folders` in `reads`), `client/index.ts` (`media.upload(file, { folder, onProgress, signal })`, parallel parts, 3 retries with backoff, abort on failure or `signal`).

Tests in `src/tests/media.test.ts` through `createClient()` with the session `fetch`:

- `client.media.upload(new File(…))` with several parts; `onProgress` is called per part and ends at the full size.
- A part `PUT` from another user's session: 404. Without a session: 401.
- `n` out of range: 400. A part larger than `partSize`: 400.
- `complete` with a wrong total size: 400, file removed.
- An aborted `signal` calls `DELETE /uploads/:id`; the row is gone.
- `GET /folders` lists `a`, `a/b` after uploads into `a/b`.
- Without `media`: `/api/cms/media/uploads` is 404.
- Note: `createApp()` takes the media sub-apps (`mediaRoutes(core)`) as a fourth argument. `onProgress` gets `{ loaded, total }`. Without a session, an unmatched media path is 401 (like every unmatched path), so the "without media" test signs in.

## Task 10: Fields in writes and reads

Files: `cms/refs.ts` (use `isRef` / `targetOf`; check `accept` and `maxSize` against the loaded media documents; default `onDelete` `restrict` for `image` / `file`), `cms/populate.ts` (`isRef` in `step()` and `populate()`; call `decorate()` with the field's options), `cms/read.ts` (`decorate()` for `find('media')`), `http/index.ts` (`strip()` / `innerFields()` treat `image` / `file` as leaves).

Tests:

- Writing an unknown id, a PDF into `image`, a file over the field's `maxSize`: 400 on the field path.
- `populate: false` returns ids; default populate returns `url`, `src`, `srcset` from the field's options (spy provider or `cloudflare()`).
- The same image through two fields with different `image` options gets different `srcset`.
- `select: { hero: true }` keeps the whole image object.
- Deleting a used image: 409 with `references`; with `onDelete: 'set-null'` the field becomes `null`.
- `populate.test.ts`: `step()` unit cases for `image` / `file`.
- Note: the `restrict` / `set-null` delete tests need `cms.media.delete`, so they run in Task 13.

## Task 11: Providers

Files: `media/images/cloudflare.ts`, `media/images/ipx.ts`.

Tests:

- `images/cloudflare.test.ts`: `getImage` gives `/cdn-cgi/image/width=640,format=webp,quality=80/<url>`; option order is stable.
- `images/ipx.test.ts`: `getImage` gives `/api/cms/media/img/<sorted modifiers>/<key>`; `render` of a 4×4 PNG fixture with `{ width: 2, format: 'webp' }` returns WebP bytes of width 2 (read back with `dimensions()`). The IPX storage reads through a stub `Storage.get`.
- Note: `render(key, modifiers, storage)` gets the storage as a third argument; the provider is created before core knows the storage, and a custom `render` needs the bytes too.

## Task 12: Serving

Files: `media/http.ts` (`GET /files/*`, `GET /img/*` in `reads`).

Tests in `src/tests/media.test.ts`:

- `/files/<key>`: 200 with `Content-Type`, `Content-Length`, `Accept-Ranges`, `nosniff`; `Range: bytes=0-9` is 206 with 10 bytes; `bytes=999999-` is 416; unknown key 404.
- `/img/<modifiers>/<key>` outside the allowlist: 400; unknown key or a PDF: 404.
- First request calls `render` once and writes `.variants/<modifiers>/<key>`; the second is served from storage, `render` not called again (spy provider).
- `ipx({ prerender: true })`: after upload, every allowed variant of that image exists; a render failure is logged and the upload still succeeds.
- Images over `images.maxSize`: `src` is the original, `srcset` empty, `/img` 404.
- Note: `/files` serves only keys of media documents (never dot-prefixed keys) and adds `Content-Security-Policy: … sandbox`, because users MAY upload HTML or SVG. `/img` is mounted only when the provider has `render`. The allowlist has no separate `{ width: 256 }` thumbnail: the admin grid uses the global `srcset` with `sizes`. It includes each option set without a width, the `src` when every width is dropped. SVG gets no variants.

## Task 13: Moves, folder renames, deletes

Files: `media/move.ts`, `media/index.ts` (`cms.media.update`, `renameFolder`, `delete`), `media/http.ts` (`PATCH /:id`, `POST /folders/rename`, `DELETE /:id`), `client/index.ts` (`media.update`, `media.renameFolder`, `media.delete` over `request()`).

Tests:

- `alt` only: `beforeChange` / `afterChange` run, no move hooks, file untouched.
- `filename` change: file and its variants move on disk, `url` changes, `beforeMove` / `afterMove` get `from` / `to`; `beforeMove` throw blocks.
- Target taken (`Hero.jpg` vs `hero.jpg`): 400 `Already used`.
- A storage stub whose `move` throws: nothing changes. A stub where the document update fails: the file moves back.
- `renameFolder('a', 'b')` moves `a/x`, `a/c/y`; `renameFolder('a', 'a/c')` is 400; one failing file shows in `failed`, the rest move; a second call finishes.
- `delete`: `beforeDelete` throw blocks; success removes file and variants; `afterDelete` runs after the storage delete; a failing `storage.delete` is logged and the delete still succeeds.
- Note: `beforeChange` / `afterChange` run when `alt` is in the update, also next to a move. `renameFolder()` rejects the root as `from`.

## Task 14: Exports and build

- `tsdown.config.ts` entries: `src/media/storage/local.ts`, `src/media/storage/s3.ts`, `src/media/images/ipx.ts`, `src/media/images/cloudflare.ts`.
- `package.json` exports `./media/local`, `./media/s3`, `./media/ipx`, `./media/cloudflare`. `Storage`, `ImageProvider`, `Modifiers`, `MediaOptions`, `MediaHooks`, `Image`, `File` types from `integral-cms`.
- Check `dist/index.mjs` imports neither `node:fs`, `ipx` nor `aws4fetch`; `dist/media/s3.mjs` imports no `node:*`.
- `pnpm build` passes.

## Task 15: Admin

Paths relative to `packages/admin`.

- `npx shadcn-vue@latest add dialog progress breadcrumb input label dropdown-menu alert-dialog`.
- `src/pages/Media.vue` (route `/media` and `/media/:folder(.*)`): folder tree from `GET /folders` plus admin-only new folders, breadcrumbs, upload button and drop zone, grid, upload list (`client.media.upload` with `onProgress`, cancel through `AbortController`), folder rename.
- `src/pages/MediaFile.vue` (`/media-file/:id`): preview by type, form for `alt` / `filename` / `folder`, copy URL, delete through `alert-dialog`, 409 lists references with links.
- `src/components/MediaPicker.vue`: the library in a `dialog`, single or multi select, disables files outside `accept` / `maxSize`, upload inside, emits ids.
- `FieldInput.vue`: `image` / `file` render the selection (thumbnail or icon), remove, ↑ / ↓ for `many`, "Choose" and "Upload new". `DocForm.vue` `normalize()` treats `many` `image` / `file` like `many` relations.
- `App.vue`: "Media" in the sidebar at order 15 when `schema.collections.media` exists.
- Check in the browser with the standalone example: upload with progress, cancel, picker, move, folder rename, delete with 409.
- Note: `components/MediaLibrary.vue` (tree, breadcrumbs, uploads, grid) is shared by `pages/Media.vue` and the picker; `components/MediaField.vue` is the field input with the picker `Dialog`, instead of `MediaPicker.vue`. It renders outside FieldInput's `<label>`. The generated shadcn components use `Icon.vue` instead of static `@lucide/vue` imports (those put every icon into the main bundle, 1.65 MB); the CLI's Google Fonts `@import` was removed and `Button.vue` kept. Not checked in a browser.

## Task 16: Example, smoke test, docs

- `examples/standalone`: `media: { storage: local({ dir: resolve('uploads') }), images: { provider: ipx() } }`, a `posts.hero` `image` field. Add `uploads/` to its `.gitignore`.
- `CLAUDE.md` smoke test: an upload step (create, one part `PUT`, complete, `curl` `/files/…` and `/img/…`).
- `README.md`: a Media section (config, fields, providers, S3 bucket CORS and lifecycle, local disk requirements, reverse proxy body limit vs `partSize`); roadmap item 3 done.
- `CLAUDE.md` architecture: `src/media/`, the four exports, `cms_uploads`, the storage-first order rule, `isRef` / `targetOf`, the `scope.media` guard.
- `src/media/README.md`, the `src/README.md` entry, `src/schema/fields/README.md`.
- Note: there is no `src/schema/fields/README.md`; `src/schema/README.md` covers fields. `uploads` went into the root `.gitignore` (examples have none of their own). The standalone example sets `maxSize: 5 GB`. The new dependencies moved pnpm's hidden `h3` hoist to nitro 3's h3 v2, which `nuxt typecheck` picked up; `examples/nuxt` now has `h3` as a dev dependency.

## Task 17: Manual checks

- S3 against MinIO (`docker run -p 9000:9000 minio/minio server /data`), with the env-gated test `media/storage/s3.live.test.ts` (skipped without `S3_TEST_ENDPOINT`): upload in parts, `get`, `move`, `delete`.
- One 1 GB upload against `local()` and MinIO through the admin; check memory stays flat (`process.memoryUsage().rss` logged in dev) and the file is intact (`shasum`).
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`.
- Note: MinIO in docker: `s3.live.test.ts` passes. 1 GB through `client.media.upload()` (Node, not the admin UI) to the standalone production build with `local()`: sha1 intact, server RSS 119 → 321 MB. 1 GB to MinIO through `cms.media.upload()` with a file stream: sha1 intact; the first run peaked at 1.28 GB RSS because the stream chunker re-concatenated per chunk, fixed to copy once per part (peak ~450 MB for 256 MB and 1 GB alike, 306 MB with a 128 MB heap cap).
