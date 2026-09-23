# integral-cms

An embeddable CMS for Vite-based frameworks. It runs inside the host app (same repo, same deploy), with no separate service. Status: proof of concept. See README.md for the vision, usage and roadmap.

## Commands

- `pnpm dev:astro` / `dev:nuxt` / `dev:tanstack`: build packages, then run the example (ports 4321 / 3000 / 3100), the core watcher and the admin dev server in parallel. Core changes reload in the example without a restart. The admin has HMR on `localhost:5173/admin/` and proxies `/api/cms` to the example (`CMS_URL`). `INTEGRAL_ADMIN_DEV_URL` makes `/admin` on the example redirect there; without it, `/admin` serves the embedded build
- `pnpm build`: packages and all examples
- `pnpm typecheck`: all workspaces. Run it before calling work done.
- `pnpm build:packages`: required after any change in `packages/*`, because examples consume `dist/`
- `pnpm --filter integral-cms db:generate`: after editing `packages/core/src/db/schema.ts`

There are no automated tests yet. Verify end to end with the curl smoke test below.

## Architecture

- `packages/core` publishes as `integral-cms`, with exports `.`, `./astro`, `./nuxt`. It is built with tsdown to `dist/`.
  - `src/schema.ts`: field and config types, type inference (`Data`, `Doc`), `defineCollection()` / `defineGlobal()` identity helpers for `const` inference, `dataSchema()` builds the zod validator.
  - `src/index.ts`: `createCms()` returns the local API (`find`, `findOne`, `findById`, `create`, `update`, `delete`, `getGlobal`, `setGlobal`) plus `fetch(request)`.
  - `src/app.ts`: Hono app. `/admin/*` serves the embedded SPA. `/api/cms/*` has `auth/*` (better-auth) and the public GET read routes (`collections/:name[/:id]`, `globals/:name`; query params are equality filters coerced to the field type), then CSRF and session middleware, then `schema` and the write routes.
  - `src/auth.ts`: better-auth with the Drizzle adapter and email/password. A database hook allows only the first user to sign up.
  - `src/db/`: Drizzle schema (`cms_documents`, `cms_globals`, better-auth tables), libsql client, migration runner. `migrations.gen.ts` is generated.
  - Adapters generate no code. They alias `#integral/config` to the host's `integral.config.ts` and point the framework at runtime files that ship as `.ts` source in `dist/` (tsdown `copy`). The host's Vite or Nitro compiles them. `env.d.ts` stubs `#integral/config`, `#app` and `App.Locals` so core can typecheck them; it is not published.
  - `src/astro/index.ts`: `injectRoute` for `/admin/[...path]` and `/api/cms/[...path]` with `src/astro/route.ts`, `addMiddleware` with `src/astro/middleware.ts` (sets `locals.integral`), the Vite alias, `ssr.external`. `injectTypes` augments `App.Locals` with `typeof import(entry).cms`; that one line is a string because Astro's API takes a string.
  - `src/nuxt/index.ts`: `nuxt.options.alias` (Nuxt forwards it to Nitro and to tsconfig `paths`), `build.transpile` for the runtime dir, `addServerHandler` with `runtime/server/handler.ts`, `addImports` of `useIntegral` from `runtime/composables.ts` (`useAsyncData` + `useRequestFetch` against the public read API, typed via `import type { cms } from '#integral/config'`). Adds the libsql native binaries to Nitro's `traceInclude`. `h3` is an optional peer because the handler imports it.
- `packages/admin` is `@integral-cms/admin` (private). It's a Vue 3 + vue-router + Tailwind v4 SPA with base `/admin/`. `scripts/embed.mjs` turns `dist/` into `dist/assets.js` (a path → base64 map), which tsdown bundles into core.
- All examples: the instance lives in `integral.config.ts` at the project root, collections in `collections/*.ts`.
- `examples/astro`: pages use `Astro.locals.integral`. Secrets come via `astro:env`.
- `examples/tanstack-start`: no adapter package. Splat server routes `src/routes/admin.$.ts` and `src/routes/api/cms/$.ts` call `cms.fetch`. Pages read content through `createServerFn` in loaders (loaders also run on the client). Nitro v3 via `nitro/vite`. Secrets come from `process.env` (`.env` loads in dev and `vite preview`).
- `examples/nuxt`: `integral.config.ts` calls `useRuntimeConfig()` (`NUXT_CMS_SECRET`, `NUXT_DATABASE_URL`); Nitro's auto-import transform covers root files. Pages use `useIntegral()`; there are no hand-written API routes.

## Design decisions

- **One JSON documents table** for all collections. Schema changes need no migration. Filters use `json_extract`, and field names are checked against the schema before they reach SQL. SonicJS does the same.
- **Core owns the fixed tables only.** Migrations come from drizzle-kit and are embedded as strings, so they run without a filesystem (Cloudflare later). They run lazily on the first DB access.
- **No module-level state.** Everything lives in the `createCms()` closure, so several instances can coexist.
- **Lazy DB and auth.** Nothing connects at import time. The secret is checked when auth is first used, so public pages keep working with a bad config.
- **The admin is prebuilt and embedded** as base64. The host's Vite config never compiles it, and it needs no filesystem at runtime.
- **One published package.** Framework adapters are subpath exports with optional peer deps (`astro`, `@nuxt/kit`, `@nuxt/schema`).
- **SQLite only for now**, through libsql (a file or Turso). D1 and Postgres come later, behind the same `documents` shape.
- **Fixed paths** `/admin` and `/api/cms`. Make them configurable only when someone needs it.
- **Reads are public, writes need a session.** Pages render the content anyway, and the Nuxt composable needs an HTTP read path for client-side navigation. Drafts will have to gate here later.

## Gotchas (each cost a debugging round)

- Nitro rewrites `typeof window` to `"undefined"` as plain text, even inside strings. That's why the admin assets are base64.
- libsql loads `@libsql/<platform>` with a dynamic require:
  - If Vite bundles core, the native binding breaks. That's why core is `ssr.external` in Astro and TanStack builds. Dev does not bundle, so it stays internal there and Vite reloads it.
  - Nitro's tracer misses the binary. That's why the Nuxt module adds `traceInclude`.
- `tsdown --watch` MUST run with `--no-clean`. Otherwise Nitro rebuilds while `dist/` is empty and logs ENOENT errors. Never run `build:packages` while the watcher runs: the admin build empties `assets.js` and the core build deletes files under the watcher.
- Nitro v3 (TanStack Start) traces the libsql binary on its own. Nitro 2 (Nuxt) does not.
- TanStack Start streams HTML. Use `grep -a` on curl output, or grep treats it as binary and prints nothing.
- `nuxt preview` runs with cwd `.output/`, so a relative `file:./cms.db` lands in the build output and gets wiped. Use absolute paths; the Nuxt example uses `resolve('cms.db')`.
- Astro 7 `astro dev` / `astro preview` run as daemons. Use `npx astro dev stop`, `npx astro preview logs`.
- `astro preview` does not load `.env`. The script runs it through `node --env-file-if-exists=.env`.
- `astro check` does not detect `@astrojs/check` under Astro 7. Use `astro sync && tsc --noEmit`.
- Nuxt: use `nuxt typecheck`. Plain `vue-tsc --noEmit` with Nuxt's reference-only tsconfig checks nothing.
- `tsc --noEmit` in the Astro example never checks `.astro` frontmatter. To test `App.Locals` typing, use a `.ts` file.
- Nuxt's `.nuxt/types/nitro-routes.d.ts` imports every server handler for `$fetch` route types, and that file belongs to the app tsconfig project. Server runtime files in a module MUST import from `h3`, not `#imports`, or the app project cannot resolve them.
- tsdown `copy` with a directory `from` nests the directory under `to`. Use the parent as `to`.
- A stale Astro daemon or leftover `cms.db` makes sign-up return 403 (first-user-only). Run `astro dev stop` and delete the DB before a smoke test.
- zsh: quote paths like `[slug].vue` in shell commands, or the glob silently matches nothing.
- tsdown d.ts output needs explicit types on the Nuxt module (`NuxtModule<Options>`). `@nuxt/schema` must be a peer, or its types get inlined.
- Nitro hook types (`nitro:config`) come from `import type {} from '@nuxt/nitro-server/augments'`.
- Hono `csrf()` only checks form-like content types. JSON requests are protected because browsers preflight them cross-origin and we send no CORS headers.
- A leftover service worker on `localhost:3000` from another project can hijack navigation. If a page works in incognito but not normally, check DevTools → Application → Service workers.

## Smoke test

```sh
B=localhost:3000; J=/tmp/jar
curl -s -c $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"name":"Admin","email":"a@b.co","password":"password123"}' $B/api/cms/auth/sign-up/email
curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"title":"Hello","slug":"hello"}' $B/api/cms/collections/posts
curl -s $B/
```

Expect 200, 201, and the post in the page HTML. Delete the example's `cms.db` before and after.

## Conventions

- TypeScript strict. Keep the file count small and add no abstraction until a second use exists.
- Validate all API input with `dataSchema()`. Every write route MUST stay behind the session middleware. Read routes are public and MUST only accept field names that exist in the schema.
- Admin UI: plain Vue SFCs with `<script setup>`, Tailwind classes, and the shared `.input` / `.btn` / `.btn-ghost` classes in `style.css`.
- Versions in use: Astro 7, Nuxt 4.5 (nitropack 2, h3 v1), TanStack Start 1.168 (nitro 3 beta, React 19), Vite 8, TypeScript 6, better-auth 1.7, drizzle-orm 0.45, Hono 4, zod 4.

## Next up

Live preview is the next feature: a `preview: (doc) => url` option per collection, an iframe in `DocEdit.vue`, and a draft cookie read by `find`. The full ordered roadmap is in README.md.
