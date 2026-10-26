# Todo

## 1. Security and data model (before the test app)

These touch every read and write path. They get harder to add as more code builds on top.

- [x] Users, roles and invites. A role is a field on the user. Invites need email (better-auth, SMTP as in the Astro example).
- [x] Access control: `access: { read, create, update, delete }` on collections, globals and fields, like Payload. A rule gets `{ user, doc }` and returns a boolean or a `where` filter. It lives in the local API, next to validation, not in HTTP. Draft reads, `private` and "writes need a session" become rules too.
- [ ] API keys: better-auth's `apiKey` plugin. A key is one more caller that the access rules see.
- [ ] Edit conflicts: a write sends the `updatedAt` it loaded, and a changed document answers 409 (`ConflictError`). Later: show who else is editing.
- [ ] Version history: a revisions table and a restore action. It also gives an audit log (who changed what).

## 2. Runtime portability (before the test app)

Each new query is one more to port, and the test app should run on a real deploy target.

- [ ] Postgres and PGlite together (one dialect). PGlite also fits tests and local dev. The JSON SQL (`json_extract`, `json_each`, `holdsAt()`) needs a layer per dialect.
- [ ] Cloudflare Workers: D1 driver or Durable Objects, bindings per request, R2 through the S3 adapter, Cloudflare Images.
- [ ] Vercel: Node functions with Turso or Postgres.
- [ ] Durable Object SQLite as the Cloudflare store, preferred over D1: D1 has no transactions that stay open across `await`, and writes rely on them (hooks, nested `cms` calls, `onDelete`). The object's `ctx.storage.transaction()` takes an async callback.
  - `defineCms()` runs inside the object, on a Kysely dialect over `ctx.storage.sql` next to the libsql one. better-auth uses the same Kysely instance.
  - The host's `cms` and `cms.fetch` forward each call to the object over RPC (one hop per call). Decide what crosses: session, request headers for `withSession()`.
  - Check: no savepoints or nested transactions (`transaction.ts` reuses the outer one), better-auth migrations, JSON functions.
  - Cost: one object fits the included duration even when active 24/7. Keep it short-lived: uploads go straight to R2, images through Cloudflare Images, no long `await`s in hooks. Cache public reads, because the object sits in one region.
  - Prototype first: one write whose hook does a nested write, plus a forced error that must roll back both.
  - The same object can later hold WebSockets for presence and multiplayer (Hibernation API).
- [ ] [celld](https://celld.dev/): a self-hosted Workers and Durable Objects runtime with the data in your own bucket. Once the Durable Objects target works, run it there too.
- [ ] Media defaults per target: `local('./.uploads')` does not work serverless.
- [ ] Rate limits: better-auth keeps them in memory by default, which serverless instances do not share.

## 3. Driven by the test app

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
- [ ] OpenAPI spec, generated from the zod schemas and `/schema`.
- [ ] CLI for starters (`create-integral`): framework, database, deploy target, sample content. Needs export and import.
- [ ] Docs, then npm.

## After publishing

- [ ] Multiplayer like Sanity (Durable Objects or Yjs).
- [ ] Presence: who is editing a document.
- [ ] SvelteKit adapter.
- [ ] Trash / soft delete.
