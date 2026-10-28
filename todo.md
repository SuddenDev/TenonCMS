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

- [ ] Postgres and PGlite together (one dialect). PGlite also fits tests and local dev. The JSON SQL (`json_extract`, `json_each`, `holdsAt()`) needs a layer per dialect.
- [ ] Cloudflare Workers: D1 driver or Durable Objects, bindings per request, R2 (`r2()` binding or `s3()`), Cloudflare Images (`cloudflare({ binding })`).
- [ ] Vercel: Node functions with Turso or Postgres.
- [ ] Durable Object SQLite as the Cloudflare store, preferred over D1: D1 has no transactions that stay open across `await`, and writes rely on them (hooks, nested `cms` calls, `onDelete`).
  - [x] Prototype (a spike, removed after the move into core). Go. Results in [design decisions](docs/dev/design-decisions.md#durable-objects).
  - [x] Move `durableObjectDialect()` into core (`integral-cms/cloudflare`), with the spike's tests. Adds `durableObject()` and `integralObject()`.
  - [x] Host code reads and writes through `createClient({ fetch: (req) => env.CMS.getByName("cms").fetch(req) })`: typed from the schema, errors arrive as `CmsError`, privileged writes use an API key. No RPC proxy until something needs the local API's trust inside the object (RPC drops error classes: `ConflictError` arrives as a plain `Error`).
  - [ ] An example or starter on Cloudflare (Worker + object, `createClient()` over the object's `fetch`, minified), then a real deploy. `examples/cloudflare` runs locally with R2 and Cloudflare Images through bindings; the deploy is open.
  - Cost: one object fits the included duration even when active 24/7. Keep it short-lived: no long `await`s in hooks. `r2()` proxies uploads and file reads through the object; move them to presigned URLs (`s3()`) and the Worker or a public bucket if that costs too much. Cache public reads, because the object sits in one region.
  - The same object can later hold WebSockets for presence and multiplayer (Hibernation API).
- [ ] [celld](https://celld.dev/): a self-hosted Workers and Durable Objects runtime with the data in your own bucket. Skipped while it is in beta (v0.6.2 on 2026-10-28). Its docs list `sql.exec()`, `transaction()` and `blockConcurrencyWhile()`. `celld deploy` stops on unknown `wrangler.jsonc` keys such as `minify`.
- [ ] Media defaults per target: `local('./.uploads')` does not work serverless.
- [ ] Rate limits: better-auth keeps them in memory by default, which serverless instances do not share.
- [ ] Bundle size (the spike: 934 KiB gzipped, 664 KiB minified; `examples/cloudflare`: 2.0 MB minified, 575 KB gzipped). Every wake of an object parses it again.
  - [ ] Passkeys opt-in: `@better-auth/passkey` and its WebAuthn and certificate libraries are 626 KiB raw, always bundled (`auth/config/build-options.ts`).
  - [ ] Maybe: check and render rich text on the server without tiptap and ProseMirror (962 KiB raw). Only if size becomes a problem, because the checks MUST match the editor's schema.

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
- [ ] CLI for starters (`create-integral`): framework, database, deploy target, sample content. Needs export and import.
- [ ] Docs, then npm.

## After publishing

- [ ] Multiplayer like Sanity (Durable Objects or Yjs).
- [ ] Presence: who is editing a document.
- [ ] SvelteKit adapter.
- [ ] Trash / soft delete.
