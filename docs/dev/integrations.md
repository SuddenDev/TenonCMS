# Framework integrations

`clientModules()` runs before other loaders. In server environments it serves `.client` modules as reference exports without evaluating their browser dependencies. In browser environments its resolver rejects `.server` files, Node built-ins and known server-only Tenon entries. It checks only imports of modules the browser environment transforms, so Vite's dependency scan and the registry crawl, which read server files without transforming them, pass. Vite dev also adds the crawl's watched files as imports of the registry, so imports from the registry are skipped; `load()` still rejects a server-only module there. Nuxt also installs this plugin with `server: true` in Nitro’s Rollup config; Vite hosts use the environment consumer.
Code: `packages/core/src/integrations/` (see its README). User docs: [framework setup](../guide/frameworks.md).

## Shared approach

- Adapters generate almost no code: only type declarations, the admin page HTML and the client registry module. They alias `#tenon/config` to the host's `tenon.config.ts` and mount runtime files that ship as TypeScript source. The host's bundler compiles them.
- They register the API route at `/_tenon/**`. The admin page is a second client entry built from the same admin library, with a virtual client registry for the host's `clientRef()` modules.
- The admin path is an **adapter option** (default `/admin`), not part of the config, because routes are registered at build time before the config can load.
- Core must stay external in server builds. libsql loads a native binary with a dynamic require, which a bundler breaks. In dev it stays internal so Vite reloads it. Cloudflare builds bundle it: Workers have no native binaries.
- Types are added by augmenting the app's types with the config type, so the client and `Astro.locals` are typed.

## Astro

- Injects the API route, the admin route and a middleware that puts a session-bound `cms` on `locals`. That is why the admin preview renders drafts. Prerendered pages get the plain instance.
- Starts the preview runtime on every page unless turned off, with `morph` on so server-rendered pages refresh after a save. Locale and path (without the locale prefix) are also set on `locals`.
- Astro's static routes match unprefixed URLs only, so with locale routing every other route needs a prefixed variant.
- With `@astrojs/cloudflare` (`config.adapter.name`), it mounts `astro/cloudflare/route.ts` and `middleware.ts` instead. They reach the object through the binding `CMS` from `cloudflare:workers`. `locals.tenon` is `createObjectClient()`, typed as the client. Prerendered pages get a client that throws, because no object exists at build time. Core is bundled, and the server build is minified (`astro:build:setup`): wrangler's `minify` does not apply to Vite builds, and Vite leaves server code unminified.

## Nuxt

- A module with a Nitro handler for the API, an admin page served from a Nitro virtual module, a plugin and auto-imported composables.
- The plugin loads the localization config into `useState` before any page reads (in-process during SSR, then from the payload), and starts the preview runtime in the browser.
- `useTenon()` wraps `useAsyncData` around the client. During SSR the client fetches in-process and forwards the request's headers, so drafts work. It merges preview drafts into results, and reads in the route's locale. The key holds the resolved options, locale included, so navigation within one locale reuses a read.
- Since Nuxt 4.6, a `useAsyncData` result has `then`, `catch` and `finally` as own properties, bound to Nuxt's promise. `live()` MUST NOT copy them onto its merged promise: Vue's `withAsyncContext()` awaits through `catch`, so a page would get Nuxt's unmerged `data`.
- The module dedupes `vue` and `vue-router`, and adds the admin entry's folder to `vite.server.fs.allow`. A `link:` install lies outside the app root, so without both it loads a second Vue and a blank admin in dev.
- Server runtime files MUST import from `h3`, not `#imports`, or the app's typecheck cannot resolve them.

## Vite hosts (TanStack Start, standalone)

- `tenonAdmin()` is a Vite plugin for frameworks without an adapter. It marks core external for builds, adds the admin entry and serves the admin page HTML. In dev it goes through the dev server so framework preambles apply; in a build it comes from the client bundle.
- The host adds a catch-all server route for `/_tenon` and a route that returns the admin HTML.
- TanStack Start allows only one client entry, so the plugin must mark the admin chunk as a non-entry before Start reads it.

## Vercel

- No adapter code. With `@astrojs/vercel`, the Astro integration takes its default Node branch: core stays external in the server build, and `@vercel/nft` traces it, `pg` and `sharp` into the function.
- `postgres()` returns its `pool`, so the host can hand it to `attachDatabasePool()` from `@vercel/functions`. Core imports nothing from Vercel.
- Media: `s3()` with keys and no `publicUrl`, on a private Neon bucket. The function serves files; their `Cache-Control` lets Vercel's CDN keep them for an hour. `credentials` covers AWS S3 from the Vercel Marketplace (OIDC).
- `migrate()` locks on Postgres, so cold starts that run together on a fresh database do not race.
- Turso: `libsqlDialect()` opens `@libsql/client/web` for remote URLs (`libsql:`, `http(s):`, `ws(s):`), because the Node entry loads the native `libsql` binary on import. Only file URLs need the binary. Not tried against a real Turso database yet.
- Not covered yet: Nuxt and TanStack Start on Vercel (Nitro's `vercel` preset).

## Cloudflare (Durable Objects)

- `tenoncms/cloudflare` runs the CMS inside a SQLite-backed Durable Object, because writes hold a transaction across `await` and D1 cannot. See [design decisions](design-decisions.md#durable-objects).
- The config sets `database: durableObject()`. `tenonObject(cms)` returns the object class, which the Worker entry exports. Each object binds its storage to its own copy of the instance (`withDatabase()`), so several objects in one isolate and an object reset stay correct. Migrations run on the first call. A failed connect or migration is not cached: the next call tries again.
- The config's own instance has no database: schema and `localization` work, every read or write throws. Code outside the object uses `createObjectClient(request, stub)`: `createClient()` over the stub's `fetch`, on the request's origin, with its cookie.
- The class is plain, without RPC. Extend `DurableObject` from `cloudflare:workers` once something needs RPC.
- Tests: `*.workerd.test.ts` run in workerd through `@cloudflare/vitest-plugin` (Vitest project `workerd`), inside the Worker of `src/tests/workerd/`.
