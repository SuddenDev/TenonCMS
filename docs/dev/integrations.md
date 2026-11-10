# Framework integrations

`clientModules()` runs before other loaders. In server environments it serves `.client` modules as reference exports without evaluating their browser dependencies. In browser environments its resolver rejects `.server` files, Node built-ins and known server-only Tenon entries. It checks only imports of modules the browser environment transforms, so Vite's dependency scan and the registry crawl, which read server files without transforming them, pass. Vite dev also adds the crawl's watched files as imports of the registry, so imports from the registry are skipped; `load()` still rejects a server-only module there. Nuxt also installs this plugin with `server: true` in Nitro’s Rollup config; Vite hosts use the environment consumer.
Code: `packages/core/src/integrations/` (see its README). User docs: [framework setup](../guide/frameworks.md).

## Shared approach

- Adapters generate almost no code: only type declarations, the admin page HTML and the client registry module. They alias `#tenon/config` to the host's `tenon.config.ts` and mount runtime files that ship as TypeScript source. The host's bundler compiles them.
- They register the API route at `/_tenon/**`. The admin page is a second client entry built from the same admin library, with a virtual client registry for the host's `clientRef()` modules.
- The admin path is an **adapter option** (default `/admin`), not part of the config, because routes are registered at build time before the config can load.
- Core must stay external in server builds. libsql loads a native binary with a dynamic require, which a bundler breaks. In dev it stays internal so Vite reloads it. Cloudflare builds bundle it: Workers have no native binaries.
- Types are added by augmenting the app's types with the config type, so the client and `Astro.locals` are typed.

## Site routes and components

- `cms.fetch` also answers `/sitemap.xml` and `/robots.txt` (`src/seo/`). Astro and Nuxt mount both paths on the `/_tenon` handler.
- The host's own route MUST win. Astro gives an injected route and a project route of the same pattern equal priority, and Nitro registers module handlers after the host's `server/routes`, so the later one wins. Neither can be fixed by order, so `siteRoutes()` checks the files at setup: `public/<name>`, and `<name>`, `<name>.*` or a `<name>/` folder in `src/pages/` (Astro) or `server/routes/` (Nuxt). Nuxt also skips a path when `@nuxtjs/sitemap` or `@nuxtjs/robots` is installed. The adapter options `sitemap: false` and `robots: false` skip a path explicitly. A host file added later needs a restart.
- Vite hosts without an adapter add the two routes themselves; the standalone example sends every other path to `cms.fetch`.
- The admin page sends `<meta name="robots" content="noindex, nofollow">`, because `robots.txt` does not name the admin path.
- Frontend components: `Image`, `Picture`, `Link`, `Blocks`, `Richtext` and (React, Astro) `Seo`, in `tenoncms/vue` (`src/integrations/vue/`), `tenoncms/react` (`src/integrations/react/`) and `tenoncms/astro/components` (`src/integrations/astro/components/`). Their logic is shared: `linkAttrs()` (`links/runtime/`), `imageAttrs()` and `pictureAttrs()` (`media/runtime/`), `seoHead()` (`helpers/seo-meta.ts`, also behind `useTenonSeo()`) and `editBlock()` (`preview/runtime/bind-elements.ts`), also public as `tenoncms/components`. A port MUST use them, not a copy.
  - Vue and React take `as` / `asChild` through their `primitive.ts`. Vue uses `inheritAttrs: false`, so `renderPrimitive()` puts attributes on the rendered element or merges them into the slot's child. With `asChild`, a component that renders content (`Blocks`) replaces the child's content.
  - Vue `Blocks` passes `useBlockEdit()` through `provide`. React and Astro pass `edit` as a prop, so React needs no context and runs in server components.
  - Astro components ship as source, with an `index.ts` that core's `tsc` skips. They have no `asChild`.
  - Nuxt registers the Vue components with a `Tenon` prefix through `addComponent()`; `TenonLink` is a runtime wrapper whose `as` defaults to `NuxtLink`.

## Job clock

`cms.jobs.run()` has no timer of its own (see [jobs](../../packages/core/src/jobs/README.md)). Each adapter starts one, and the option `jobs: false` turns it off.

- **Nitro hosts (Nuxt, TanStack Start, standalone):** the task `tenon:jobs` runs `cms.jobs.run()` every minute through `scheduledTasks["* * * * *"]`. `withJobsTask()` (`integrations/nitro-jobs.ts`) adds the task to the host's own entry instead of replacing it.
  - Nuxt (Nitro 2): the module sets `experimental.tasks` and the task in `nitro:config`. The handler is the plain object in `nuxt/runtime/server/jobs-task.ts`, so it imports nothing from Nitro. It reaches the config through `#tenon/config`.
  - Vite hosts (Nitro 3): `tenonAdmin()` carries a `nitro` key, a Nitro module that Nitro installs from any Vite plugin. It sets the same options and registers the handler as a virtual module (`#tenon/jobs-task`) that imports the `entry` file by absolute path. Core does not depend on Nitro, so the part of its module API that it uses is typed in `vite/index.ts`.
  - Nitro runs scheduled tasks with croner on Node, Bun and Deno, and maps them to Cron Triggers (Cloudflare) and Cron Jobs (Vercel). A task of one name runs once at a time per process.
- **Astro on Node:** `astro/jobs-interval.ts`, started by the middleware on the first request that is not prerendered. A `setInterval` of 60 s, `unref()`'d, ticks at once and then every minute. It is keyed on `globalThis` and replaces the timer when the module reloads (HMR), so timers never stack. A failed tick is logged. The integration passes the define `__TENON_JOBS__`, true for `astro dev` and `@astrojs/node`; serverless adapters freeze the process, and Cloudflare has the alarm.
- **Cloudflare:** the alarm of the Durable Object, see below.
- **Other hosts:** `jobs.secret` mounts `/_tenon/jobs/run` for an external pinger.

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
- The object is the job clock. `withDatabase()` gets `wake(at)`, which the queue calls after the commit of a job due at `at`. `wake` sets the alarm when none is set or the set one is later (`arm-alarm.ts`). `fetch` sets the alarm to now once per instance when none is set, after the request, so the cron entries get seeded after a restart. A failed request sets it too. Setting it during the request races with the first migration. `alarm()` calls `cms.jobs.run()` and sets the alarm to `next`; a throw makes Cloudflare retry it. A job that is due now fires the alarm at once, so a test that queues a job sees it run on its own.
- `setAlarm()` creates workerd's `_cf_KV` table, and workerd refuses to read its columns and indexes. The dialect's introspector (`DurableObjectIntrospector`) and a rewrite of better-auth's index query skip every `_cf_` table, or migrations fail on the next cold start (`SQLITE_AUTH`).
- The class is plain, without RPC. Extend `DurableObject` from `cloudflare:workers` once something needs RPC.
- Tests: `*.workerd.test.ts` run in workerd through `@cloudflare/vitest-plugin` (Vitest project `workerd`), inside the Worker of `src/tests/workerd/`.
