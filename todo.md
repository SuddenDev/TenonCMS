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

- [ ] Fix TS2589: a `relation` inside `blocks` makes `find()` on that collection too deep to type. Found by the spike.
- [ ] Frontend components for Nuxt, Astro and React: image (`srcset` is computed already), rich text renderer, maybe a blocks renderer. Build one framework first, then port.
- [ ] Search: in the admin first (`LIKE` on title fields), later FTS5 / `tsvector` and a shared function. Depends on the database work.
- [ ] Jobs and cron: one protected `POST /jobs/run`, triggered per platform (Cloudflare Cron Triggers, Vercel Cron, an interval on Node).
- [ ] Scheduled publishing, on top of jobs.
- [ ] Webhooks and cache invalidation: rebuild prerendered pages or purge the CDN on publish.
- [ ] Sitemap and robots helper, from `permalink` and `alternates`.
- [ ] Mobile: the admin works well on phones.
- [ ] Smaller optimizations.

## 4. Publishing

- [ ] Export and import: backups, moving between databases, seeding.
- [ ] Field renames: a small content migration (`renameField`), because a renamed field orphans its stored JSON.
- [ ] OpenAPI spec, generated from the zod schemas and `/schema`. Generated SDKs (hey-api) build on it for consumers without TypeScript; TypeScript hosts keep `createClient()`.
- [ ] CLI for starters (`create-tenon`): framework, database, deploy target, sample content. Needs export and import.
- [ ] Docs, then npm.

## After publishing

- [ ] Multiplayer like Sanity (Durable Objects or Yjs).
- [ ] Presence: who is editing a document.
- [ ] SvelteKit adapter.
- [ ] Trash / soft delete.
