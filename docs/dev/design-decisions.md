# Design decisions

The choices that shape the rest of the code, and why.

## Data

- **One JSON documents table for all collections.** Schema changes need no migration. Filters read the JSON, and field names are checked against the schema before they reach SQL. SonicJS does the same.
- **Relation ids live in the document JSON.** A string, or a list of strings for `many`. Reverse lookups (joins, delete checks) scan the JSON. That is fine up to roughly 10k to 50k documents per collection, and indexes can come later without API changes.
- **Core owns only the fixed tables.** CMS migrations are hand-written code inside the bundle, so they run without a filesystem (Cloudflare later). better-auth creates its own tables from the real options, plugins included. All run lazily on first database use.
- **SQLite or Postgres, one document shape.** SQLite through libsql (a file or Turso), Node's built-in `node:sqlite` or a Durable Object. Postgres through a `pg` pool or PGlite. Each database is a helper on its own entry (`libsql()`, `sqlite()`, `postgres()`, `pglite()`, `durableObject()`) that returns `{ dialect }`, and its driver is an optional peer dependency, so a build carries only the driver it uses. Both keep JSON in `text` columns, so rows map the same way; Postgres casts to `jsonb` where a query reads a path. The queries that differ ask `isPostgres(db)` (the Kysely adapter). The rest is SQL both understand: `TRUE`, `IS NOT DISTINCT FROM`, `ON CONFLICT`, `RETURNING`. `jsonb` columns and GIN indexes can come with search.
- **PGlite tests the Postgres code.** It is Postgres 17 in WebAssembly, so the integration suite runs on it as a second Vitest project, without a server.
- **Durable Object SQLite over D1 for Cloudflare.** Writes hold a transaction across `await` (hooks, nested calls, `onDelete`). D1 cannot, a Durable Object can. See [Durable Objects](#durable-objects).
- **Our own small libsql dialect for Kysely.** better-auth's migrations only work with its Kysely adapter, and the off-the-shelf libsql dialect pulls an older client and a second native binary that the Nuxt build does not trace.

## Behavior

- **Validation, access rules and hooks live in the local API.** HTTP is a thin layer, so server code, HTTP and the admin behave the same. By default published reads are public, while drafts and writes need a user, because pages render the content anyway.
- **Writes run in one transaction** with their hooks, deletion effects and nested calls. Nested calls MUST go through the hook's `cms`.
- **Options the admin evaluates MUST be JSON.** Conditions, built-in checks and plain defaults run in both places. `validate`, function defaults and hooks run on the server only.
- **Tiptap on the server too.** The server checks and renders rich text with the same Tiptap and ProseMirror schema as the editor, so both always agree. Its size (about 960 KiB raw) is accepted; a lighter server-only path is not an option.
- **Presets are data, not features.** Page paths are stored and filtered like any field, with no special "find by path". The SEO title fallback is computed at render time and never stored.

## Structure

- **Instance-owned server state.** Everything server-side lives in the `defineCms()` closure, so several instances can coexist. The browser preview deliberately shares one store across its framework entries.
- **Lazy database and auth.** Nothing connects at import time, so public pages keep working with a bad config.
- **One published package.** Framework adapters are subpath exports with optional peer dependencies.
- **The admin path is an adapter option**, not part of the config. Routes are registered at build time, before the config can load.

## Admin

- **The admin is a compiled library the host bundles.** Core never imports it, so headless is free. Extensions are exports in the host's own modules, compiled by the host's Vite with HMR.
- **The extension contract is `mount(el, ctx)` only.** No framework components cross the boundary, so the admin bundles its own Vue and hosts install nothing. Data flows in through `ctx`, out through callbacks. New slots MUST use the same contract, and helpers go under `ctx.tenon`.

## Durable Objects

A spike (2026-10-28) ran `defineCms()` unchanged inside a SQLite-backed Durable Object. Result: **go**. It became `tenoncms/cloudflare`; its tests are the `*.workerd.test.ts` files in core.

- **Transactions.** Kysely's begin, commit and rollback map onto `ctx.storage.transaction(callback)`: begin opens a callback that waits until commit or rollback settles it. A throw after a nested write and after a timer or a call to another object rolls back everything.
- **One caller at a time.** While the transaction is open, workerd holds other events (requests, timers). Code of the same event still runs, and without a queue its statements land inside the open transaction. Kysely queues connections itself for any `SqliteAdapter` dialect, so the dialect needs no lock of its own.
- **Everything else ran as is:** CMS and better-auth migrations, JSON SQL (`json_extract`, `json_each`, the partial index), sign-up, sessions, invites, and populating 150 relations (ID lists are one JSON parameter, below the limit of 100 per query).
- **RPC loses error classes.** A `ConflictError` thrown in the object reaches the Worker as a plain `Error` with its message and own fields, without its class or `status`. So host code uses `createClient()` with the object's `fetch` instead: typed from the schema, with `CmsError` and its `status`, and an API key for privileged writes. The Worker forwards the `Request`, and the object answers with the `Response`.
- **Size and speed.** 5.1 MB raw, 934 KiB gzipped, which fits the free plan (3 MB). Largest: zod, better-auth, kysely, tiptap. Local `wrangler dev`: first request about 45 ms, warm about 4 ms.
- **Hibernation.** After about 10 idle seconds the object drops its memory. The next request runs the constructor and a no-op migration check again.
- **One copy per object.** `ctx.storage` only exists in the object's constructor, but the config builds its instance at import time. So `tenonObject()` gives each object its own copy of that instance (`withDatabase()`), bound to its storage. Binding the storage into the shared module instance would break with several objects in one isolate, and after an object resets while its isolate lives on. Migrations run on the first call; the memoized connection makes concurrent first calls wait for the same run, so no `blockConcurrencyWhile()` is needed. A failed run is dropped, so the next call retries instead of failing until the object is evicted.
- **Cloudflare bindings for media.** The example uses `r2()` over a bucket binding and `cloudflare({ binding })` over the Images binding: no keys, no CORS, simulated by `wrangler dev`, created by `wrangler deploy`. The cost: uploads and file reads pass through the object. `s3()` with presigned URLs stays the way around that.
- **Astro pages get the plain HTTP client.** `Astro.locals.tenon` is `createClient()` over the object's stub, with the request's cookie forwarded, not a wrapper shaped like the local API. Its gaps (no `withSession()`, async `localization()`, `createDraft()`) are documented instead. Pages that read the CMS are not prerendered, because no object exists at build time.
