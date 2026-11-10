# Todo

## 1. Security and data model (before the test app)

These touch every read and write path. They get harder to add as more code builds on top.

- [x] Users, roles and invites. A role is a field on the user. Invites need email (better-auth, SMTP as in the Astro example).
- [x] Access control: `access: { read, create, update, delete }` on collections, globals and fields, like Payload. A rule gets `{ user, doc }` and returns a boolean or a `where` filter. It lives in the local API, next to validation, not in HTTP. Draft reads, `private` and "writes need a session" become rules too.
- [x] API keys: better-auth's `apiKey` plugin. A key is one more caller that the access rules see.
- [x] Edit conflicts: a write sends the `updatedAt` it loaded, and a changed document answers 409 (`ConflictError`). The admin holds an edit lock with takeover, like Payload and WordPress.
- [x] Version history: a revisions table and a restore action. It also gives an audit log (who changed what).

## 2. Runtime portability (before the test app)

Each new query is one more to port, and the test app should run on a real deploy target.

- [x] Postgres and PGlite together (one dialect). PGlite also fits tests and local dev. The JSON SQL (`json_extract`, `json_each`, `holdsAt()`) needs a layer per dialect.
- [x] Cloudflare Workers: D1 driver or Durable Objects, bindings per request, R2 (`r2()` binding or `s3()`), Cloudflare Images (`cloudflare({ binding })`).
- [x] Vercel: Node functions with Turso or Postgres.
  - [x] `examples/vercel`: Astro, Postgres with `attachDatabasePool()`, a private Neon bucket through `s3()` with keys. Builds and passes the smoke tests locally. Migrations lock on Postgres, so cold starts do not race.
  - [x] A real deploy with Neon (guide: `docs/guide/frameworks.md#with-neon`), then the smoke tests against it, uploads included. Locally the example already runs against Neon.
  - [ ] `vercel()` image provider: variant URLs to `/_vercel/image?url=…&w=…&q=…`, like `cloudflare()` without a binding. Only width and quality; widths MUST match `imagesConfig.sizes` of `@astrojs/vercel`; falls back to `ipx()` in local dev; public media only. Drops sharp from the function.
  - [x] Turso: remote URLs open `@libsql/client/web`, so the native binary is not loaded. Not deployed yet.
- [x] Durable Object SQLite as the Cloudflare store, preferred over D1: D1 has no transactions that stay open across `await`, and writes rely on them (hooks, nested `cms` calls, `onDelete`).
  - [x] Prototype (a spike, removed after the move into core). Go. Results in [design decisions](docs/dev/design-decisions.md#durable-objects).
  - [x] Move `durableObjectDialect()` into core (`tenoncms/cloudflare`), with the spike's tests. Adds `durableObject()` and `tenonObject()`.
  - [x] Host code reads and writes through `createClient({ fetch: (req) => env.CMS.getByName("cms").fetch(req) })`: typed from the schema, errors arrive as `CmsError`, privileged writes use an API key. No RPC proxy until something needs the local API's trust inside the object (RPC drops error classes: `ConflictError` arrives as a plain `Error`).
  - [x] An example on Cloudflare (Worker + object, `createClient()` over the object's `fetch`, minified) and a real deploy: `examples/cloudflare` with R2 and Cloudflare Images through bindings.
  - Cost: one object fits the included duration even when active 24/7. Keep it short-lived: no long `await`s in hooks. `r2()` proxies uploads and file reads through the object; move them to presigned URLs (`s3()`) and the Worker or a public bucket if that costs too much. Cache public reads, because the object sits in one region.
  - The same object can later hold WebSockets for presence and multiplayer (Hibernation API).
- [ ] [celld](https://celld.dev/): a self-hosted Workers and Durable Objects runtime with the data in your own bucket. Skipped while it is in beta (v0.6.2 on 2026-10-28). Its docs list `sql.exec()`, `transaction()` and `blockConcurrencyWhile()`. `celld deploy` stops on unknown `wrangler.jsonc` keys such as `minify`.
- [x] Media defaults per target: in a read-only working directory (serverless), no `media` option means no media library and `media: true` throws, as on Workers.
- [x] Rate limits: `storage: "database"` is the default, so serverless instances share them.
- [x] Bundle size (the spike: 934 KiB gzipped, 664 KiB minified; `examples/cloudflare`: 1,623 KiB minified, 470 KiB gzipped, down from 2.0 MB and 575 KB). Every wake of an object parses it again.
  - [x] Passkeys opt-in: the host adds `passkey()` from `@better-auth/passkey` (an optional peer), and the admin shows passkeys only then.

## 3. Driven by the test app

- [x] Fix TS2589: a `relation` inside `blocks` makes `find()` on that collection too deep to type. Found by the spike.
- [x] Frontend components for Nuxt, Astro and React: image (`srcset` is computed already), rich text renderer, maybe a blocks renderer. Build one framework first, then port.
  - [x] Vue: `tenoncms/vue` with `Link`, `Blocks` (`useBlockEdit()`) and `Richtext`, with `as` / `asChild`.
  - [x] Nuxt: auto-imported as `TenonLink` (over `NuxtLink`), `TenonBlocks` and `TenonRichtext`, plus `useTenonSeo()`.
  - [x] Image component: `Image` in all three, `TenonImage` in Nuxt.
  - [x] Astro and React ports: `tenoncms/astro/components` and `tenoncms/react`. The shared helpers are `tenoncms/components`.
  - [x] `Picture` (art direction) in all three, and `Seo` for Astro and React on `seoHead()`, which `useTenonSeo()` uses too.
- [ ] Search: in the admin first (`LIKE` on title fields), later FTS5 / `tsvector` and a shared function. Depends on the database work.
- [x] Jobs and cron: one protected `POST /jobs/run`, triggered per platform (Cloudflare Cron Triggers, Vercel Cron, an interval on Node).
- [x] Scheduled publishing, on top of jobs.
- [x] Webhooks: outgoing, in code, on the jobs queue, signed with Standard Webhooks (`docs/guide/webhooks.md`). `debounce` collects changes into one request, on `queue({ key, merge })` of jobs. `examples/vercel` has prerendered posts, a preview route and Deploy buttons through admin `actions` (one-click buttons in the top bar or the content menu). Deferred: media events, webhooks managed in the admin.
- [ ] Read caching: Tenon sets no `Cache-Control` on content reads. Cache public reads (the Durable Object sits in one region), and purge on publish.
- [x] Sitemap and robots helper, from `permalink` and `alternates`: `/sitemap.xml` and `/robots.txt` with no config, `sitemap.entries` and `robots.rules` to extend, `cms.sitemap()`, `sitemapXml()` and `robotsTxt()`. A host route wins. The `permalink: true` read option.
- [ ] Mobile: the admin works well on phones. Start with the content list, which is not usable there yet.
- [ ] Smaller optimizations.

## 4. Found in the test app (before the demos)

From building the House of Cacao site.

### Bugs

- [x] Link buttons vanish in the live preview, with a hydration mismatch (`rendered on server: a.link, expected on client: Symbol(v-cmt)`).
  - Cause: a read populates a link field to `{ href, title, target }`, but the draft holds the stored `{ reference: { collection, id } }`. `mergeValue` merges per key of the draft, so the merged link has no `href`.
  - Fix: keep the populated value while the draft's reference equals the current one (keep `reference` in the populated shape so the merge can compare), or resolve link drafts in the preview runtime.
- [x] Bound text inside blocks does not update live. Clicking `data-cms="pages:<id>:content.0.headline"` opens the right field, but typing does not patch the text.
  - Cause: `valueAt` in the preview runtime steps only into plain objects (`isObject` rejects arrays), so a path through a `blocks` or `array` field resolves to `undefined`.
  - Fix: let `valueAt` index arrays by number.
- [x] Clicking a bound item inside a block does not expand and scroll to its field. It sometimes expands offscreen. Once the block is open, scrolling works.
  - Cause: the focus watcher ran during setup, before the field had an element, and a row that just opened keeps its content `hidden` for a frame.
- [x] Missing config fails only on request, not at startup. With plain `node .output/server/index.mjs` (no `.env`), the site renders, but the admin gets `500` on `/_tenon/auth/get-session` and `401` on `/_tenon/schema`, because `secret` is `''` and is checked lazily.
  - Fix: validate all required config (`secret`, `database`, media storage) at startup and exit with one error that lists every missing or invalid value.
- [x] Deleting a document that is still referenced fails, even after the confirm dialog. It SHOULD apply the configured `onDelete` rule (for example, clear the reference), then delete.
  - Cause: "Delete and break links" was an `AlertDialogAction`, which closes the dialog (cancel) before its click confirms.
- [x] The CMS overflows inside the admin. Find out why.
  - Not reproduced in hoc-web; likely the site's GSAP ScrollTrigger. Found and fixed: a `<fieldset>` grew to the width of a long row title, and focusing a field scrolled the pane sideways.
- [x] HMR: changes sometimes do not show right away. Find out when and why.
  - Cause: the admin bar bundled a dev build of Vue, which replaced the host's `__VUE_HMR_RUNTIME__` once an editor was signed in. The admin build now compiles Vue for production.

### Admin

- [ ] Search in the blocks modal.
- [ ] Media modal: view sizes (grid and list), and multi-select with Shift and Cmd/Ctrl.
- [ ] Cmd/Ctrl+S shows a toast: "Tenon saves your changes automatically".
- [ ] Duplicate a collection item, from the list and from the "…" menu.
- [ ] Blocks and array tree: put "expand all / collapse all" on the same line as the label.
- [ ] Hide the Astro and Nuxt devtools inside the admin and the live preview, if possible.
- [ ] Admin option for the logo parts: choose which one shows where (for example the icon in the header, the full logo in the admin).

### Fields

- [ ] Size field: a number with a unit (`px`, `vh`, …).
- [ ] Textarea: a `rows` option, and keep empty lines.
- [ ] Rich text:
  - [ ] Extend Tiptap from the config (extensions, toolbar).
  - [ ] Blocks or classes inside rich text.
  - [ ] A smaller default toolbar.
  - [ ] Maybe a font selector.
- [ ] Tracking: make Google Analytics, Tag Manager, Facebook Pixel and similar easy to set up, maybe as a field type.
- [ ] Link Field: Link to a file as option that can be disabled by host config. I was considering an "allowed" field option, that is either `*` , `["internal", "external", "file"]`. Maybe thats overkill? An icon button in the link input (suffix) and a "File…" option in the combobox that opens the media modal.
- [ ] Link Field: Should this also have an open in new tab co-field predefined?

### Types

- [ ] Export a type for blocks, like the one for field types.
- [ ] Generate most of the host's content types (`app/types/cms.ts` in the test app) from the schema.

## 5. Publishing

- [ ] Export and import: backups of all data (collections, globals, media, config), moving between databases, seeding.
- [ ] Field renames: a small content migration (`renameField`), because a renamed field orphans its stored JSON.
- [ ] OpenAPI spec, generated from the zod schemas and `/schema`. Generated SDKs (hey-api) build on it for consumers without TypeScript; TypeScript hosts keep `createClient()`.
- [ ] CLI for starters (`create-tenon`): framework, database, deploy target, sample content. Needs export and import.
- [ ] Docs, then npm.

## After publishing

- [ ] Multiplayer like Sanity (Durable Objects or Yjs).
- [ ] Presence: who is editing a document.
- [ ] SvelteKit adapter.
- [ ] Trash / soft delete.
