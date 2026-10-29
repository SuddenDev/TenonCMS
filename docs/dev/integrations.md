# Framework integrations

Code: `packages/core/src/integrations/` (see its README). User docs: [framework setup](../guide/frameworks.md).

## Shared approach

- Adapters generate almost no code: only type declarations, the admin page HTML and the client registry module. They alias `#integral/config` to the host's `integral.config.ts` and mount runtime files that ship as TypeScript source. The host's bundler compiles them.
- They register the API route at `/api/cms/**`. The admin page is a second client entry built from the same admin library, with a virtual client registry for the host's `clientRef()` modules.
- The admin path is an **adapter option** (default `/admin`), not part of the config, because routes are registered at build time before the config can load.
- Core must stay external in server builds. libsql loads a native binary with a dynamic require, which a bundler breaks. In dev it stays internal so Vite reloads it. Cloudflare builds bundle it: Workers have no native binaries.
- Types are added by augmenting the app's types with the config type, so the client and `Astro.locals` are typed.

## Astro

- Injects the API route, the admin route and a middleware that puts a session-bound `cms` on `locals`. That is why the admin preview renders drafts. Prerendered pages get the plain instance.
- Starts the preview runtime on every page unless turned off, with `morph` on so server-rendered pages refresh after a save. Locale and path (without the locale prefix) are also set on `locals`.
- Astro's static routes match unprefixed URLs only, so with locale routing every other route needs a prefixed variant.
- With `@astrojs/cloudflare` (`config.adapter.name`), it mounts `astro/cloudflare/route.ts` and `middleware.ts` instead. They reach the object through the binding `CMS` from `cloudflare:workers`. `locals.integral` is `createObjectClient()`, typed as the client. Prerendered pages get a client that throws, because no object exists at build time. Core is bundled, and the server build is minified (`astro:build:setup`): wrangler's `minify` does not apply to Vite builds, and Vite leaves server code unminified.

## Nuxt

- A module with a Nitro handler for the API, an admin page served from a Nitro virtual module, a client plugin for the preview runtime and auto-imported composables.
- `useIntegral()` wraps `useAsyncData` around the client. During SSR the client fetches in-process and forwards the request's headers, so drafts work. It merges preview drafts into results, and reads in the route's locale.
- Server runtime files MUST import from `h3`, not `#imports`, or the app's typecheck cannot resolve them.

## Vite hosts (TanStack Start, standalone)

- `integralAdmin()` is a Vite plugin for frameworks without an adapter. It marks core external for builds, adds the admin entry and serves the admin page HTML. In dev it goes through the dev server so framework preambles apply; in a build it comes from the client bundle.
- The host adds a catch-all server route for `/api/cms` and a route that returns the admin HTML.
- TanStack Start allows only one client entry, so the plugin must mark the admin chunk as a non-entry before Start reads it.

## Vercel

- No adapter code. With `@astrojs/vercel`, the Astro integration takes its default Node branch: core stays external in the server build, and `@vercel/nft` traces it, `pg` and `sharp` into the function.
- `postgres()` returns its `pool`, so the host can hand it to `attachDatabasePool()` from `@vercel/functions`. Core imports nothing from Vercel.
- Media: `s3()` with keys and no `publicUrl`, on a private Neon bucket. The function serves files; their `Cache-Control` lets Vercel's CDN keep them for an hour. `credentials` covers AWS S3 from the Vercel Marketplace (OIDC).
- `migrate()` locks on Postgres, so cold starts that run together on a fresh database do not race.
- Turso: `libsqlDialect()` opens `@libsql/client/web` for remote URLs (`libsql:`, `http(s):`, `ws(s):`), because the Node entry loads the native `libsql` binary on import. Only file URLs need the binary. Not tried against a real Turso database yet.
- Not covered yet: Nuxt and TanStack Start on Vercel (Nitro's `vercel` preset).

## Cloudflare (Durable Objects)

- `integral-cms/cloudflare` runs the CMS inside a SQLite-backed Durable Object, because writes hold a transaction across `await` and D1 cannot. See [design decisions](design-decisions.md#durable-objects).
- The config sets `database: durableObject()`. `integralObject(cms)` returns the object class, which the Worker entry exports. Each object binds its storage to its own copy of the instance (`withDatabase()`), so several objects in one isolate and an object reset stay correct. Migrations run on the first call. A failed connect or migration is not cached: the next call tries again.
- The config's own instance has no database: schema and `localization` work, every read or write throws. Code outside the object uses `createObjectClient(request, stub)`: `createClient()` over the stub's `fetch`, on the request's origin, with its cookie.
- The class is plain, without RPC. Extend `DurableObject` from `cloudflare:workers` once something needs RPC.
- Tests: `*.workerd.test.ts` run in workerd through `@cloudflare/vitest-plugin` (Vitest project `workerd`), inside the Worker of `src/tests/workerd/`.
