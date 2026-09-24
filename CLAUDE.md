# integral-cms

An embeddable CMS for Vite-based frameworks. It runs inside the host app (same repo, same deploy), with no separate service. Status: proof of concept. See README.md for the vision, usage and roadmap.

## Commands

- `pnpm dev:astro` / `dev:nuxt` / `dev:tanstack`: build packages, then run the example (ports 4321 / 3000 / 3100), the core watcher and the admin playground in parallel. Core changes reload in the example without a restart. The playground has HMR on `localhost:5173/admin/` and proxies `/api/cms` to the example (`CMS_URL`). The example's `/admin` uses the admin built at startup; `pnpm --filter @integral-cms/admin watch` rebuilds it on change (full reload)
- `pnpm build`: packages and all examples
- `pnpm typecheck`: runs `build:packages`, then typechecks all workspaces. Run it before calling work done. While a dev watcher runs, use `pnpm -r typecheck` instead (see Gotchas).
- `pnpm build:packages`: required after any change in `packages/*`, because examples consume `dist/`. Core builds first, then the admin writes into `packages/core/dist/admin`
- `pnpm --filter integral-cms db:generate`: after editing `packages/core/src/db/schema.ts`
- `pnpm test`: Vitest in `packages/core` (`pnpm --filter integral-cms test:watch` to watch). No build needed, tests import `src/`.

## Testing

- TDD, RED then GREEN: write a failing test first and run it to see it fail for the right reason. Then write the least code that makes it pass. A bug fix starts with a test that reproduces it.
- Tests live next to the code as `*.test.ts`. Unit tests cover pure functions. `src/app.test.ts` is the integration suite: a real `defineCms()` on `:memory:` libsql, driven through `createClient()` with a `fetch` that calls `cms.fetch` and keeps the session cookie. Add HTTP behavior there.
- Examples and adapters are not tested yet. Verify them with the curl smoke test below.

## Architecture

- `packages/core` publishes as `integral-cms`, with exports `.`, `./client`, `./register` (types only), `./astro`, `./nuxt`, `./vite`, `./admin`, `./admin/vue`, `./admin/react`. It is built with tsdown to `dist/`. `vue`, `react` and `react-dom` are optional peers used only by the two helpers, `vite` only by `./vite`.
  - `src/schema.ts`: field and schema types, type inference (`Data`, `Doc`), `defineCollection()` / `defineGlobal()` identity helpers for `const` inference, `dataSchema()` builds the zod validator.
  - `src/index.ts`: `defineCms({ collections, globals, database, secret })` returns the local API (`find`, `findOne`, `findById`, `create`, `update`, `delete`, `getGlobal`, `setGlobal`) plus `fetch(request)`.
  - `src/client.ts`: `createClient()`, a typed HTTP client for `/api/cms` with the local API's method names. It owns `API_BASE`; core imports it from here, because the file has no runtime dependencies. Imports types only, so it is safe in the browser. Its types come from the `Register` interface; a type argument overrides it. `src/register.d.ts` (copied to `dist`) augments it with the type of `#integral/config`'s default export. If that alias does not resolve, `cms` is silently `any`, so test typing with `@ts-expect-error`. Keep it in sync with the routes in `app.ts`. The admin uses it too (`packages/admin/src/api.ts`), so it is the only HTTP client.
  - `src/app.ts`: Hono app. `/api/cms/*` has `auth/*` (better-auth) and the public GET read routes (`collections/:name[/:id]`, `globals/:name`; query params are equality filters coerced to the field type, except `limit`), then CSRF and session middleware, then `schema` and the write routes.
  - `src/auth.ts`: better-auth with the Drizzle adapter and email/password. A database hook allows only the first user to sign up.
  - `src/db/`: Drizzle schema (`cms_documents`, `cms_globals`, better-auth tables), libsql client, migration runner. `migrations.gen.ts` is generated.
  - Adapters generate no code. They alias `#integral/config` to the host's `integral.config.ts` and point the framework at runtime files that ship as `.ts` source in `dist/` (tsdown `copy`). The host's Vite or Nitro compiles them. `env.d.ts` stubs `#integral/config`, `#app` and `App.Locals` so core can typecheck them; it is not published.
  - `src/admin/`: hand-written `index.d.ts` for `integral-cms/admin` and `default.ts`, the stub `#integral/admin` resolves to when the host has no `integral.admin.ts`. Both are copied to `dist/admin` (with `entry.ts` and `virtual.d.ts`), where the admin's Vite build writes `index.js`. `vue.ts` and `react.ts` are tsdown entries: `renderVue(Component)` / `renderReact(Component)` wrap a host component into a `Mount` with reactive props and `update`.
  - Standalone admin page: `src/admin/entry.ts` mounts the admin with `#integral/admin`, `src/admin/html.ts` builds the page from the entry's script and CSS URLs and holds the helpers all adapters share (`adminPath`, `adminAlias`, `adminInput`, `adminChunk`, `Options`), and `#integral/admin-html` exports that page as a string (`src/admin/virtual.d.ts`, referenced by `register.d.ts`). No host shell, CSS or JS loads on `/admin`.
  - `src/vite/index.ts`: `integralAdmin()` for Vite frameworks without an adapter. Sets `ssr.external` for builds, aliases `#integral/admin`, adds the entry as a second `client` input, and serves `#integral/admin-html` (dev: `server.transformIndexHtml`, so framework preambles like React Refresh get in; build: from the client bundle, which builds before the server).
  - `src/astro/index.ts`: `injectRoute` for `/api/cms/[...path]` with `src/astro/route.ts` and, unless `admin: false`, `<path>/[...path]` with `src/astro/admin.astro` (reads the base from `Astro.routePattern`, imports `../admin/entry.ts`). `addMiddleware` with `src/astro/middleware.ts` (sets `locals.integral`), the Vite alias, `ssr.external`. `injectTypes` augments `App.Locals` and the client's `Register` with `typeof import(entry).default`; it is a string because Astro's API takes a string, and it MUST stay a module (`export {}`), or `declare module` replaces the client's types instead of augmenting them.
  - `src/nuxt/index.ts`: `nuxt.options.alias` (Nuxt forwards it to Nitro and to tsconfig `paths`), `build.transpile` for the runtime dir, `addServerHandler` for `/api/cms/**` with `runtime/server/handler.ts`, unless `admin: false`, a standalone `/admin` page: `dist/admin/entry.ts` is a second client Vite input, `runtime/server/admin.ts` returns the page from the Nitro virtual `#integral/admin-html` (dev: `@vite/client` + `/@fs` path; build: from `build:manifest`, where the entry is also deleted so Nuxt does not preload it on host pages), `addTypeTemplate` references `integral-cms/register` (app and Nitro contexts), `addImports` of `useIntegral` from `runtime/composables.ts` (`useAsyncData` around `createClient()`'s read methods; during SSR the client fetches through `event.fetch`, typed via `import type cms from '#integral/config'`). Adds the libsql native binaries to Nitro's `traceInclude`. `h3` is an optional peer because the handler imports it.
- `packages/admin` is `@integral-cms/admin` (private). It's a Vue 3 + vue-router + Tailwind v4 app built in Vite lib mode to `packages/core/dist/admin/index.js`, with Vue bundled in and the CSS inlined (`?inline`), injected by `mountAdmin()`. The admin always runs on a page of its own, so the global styles stay. `src/index.ts` exports `mountAdmin(el, options, base)` and `defineAdmin()`. Titles go through Unhead (`useHead`, template `<title> · Admin`); host pages get their `label`. `src/options.ts` holds `optionsKey`, `integralKey` and `pagePath()`. Its types come from `packages/core/src/admin/index.d.ts`, the only copy. Options are named slots (`fields` by custom type name, `pages` by key with optional `route`), each a `Mount<Ctx>` function: `(el, ctx) => cleanup | { update?(ctx), unmount() }`. `Mount.vue` runs one, adds `ctx.integral`, and forwards context changes to `update`; `FieldInput.vue` and the router use it. Host pages are registered before the built-in routes; on an equal path vue-router keeps the first, so a host page on `/` or `/collections/...` replaces the built-in view. `index.html` + `src/main.ts` are the dev playground.
- Hosts customize the admin with `integral.admin.ts` at the project root (`export default defineAdmin({ fields, pages })`). A page's `route` starts with `/` and defaults to `/<key>`. Pages without `label` stay out of the sidebar. Adapters alias `#integral/admin` to it if it exists, else to the stub. Adding or removing it needs a dev server restart.
- All examples: the instance lives in `integral.config.ts` at the project root, collections in `collections/*.ts`.
- `examples/astro`: pages use `Astro.locals.integral`. Secrets come via `astro:env`.
- `examples/tanstack-start`: no adapter package. `tsconfig.json` maps `#integral/config` and loads `integral-cms/register` for the client type. The splat server route `src/routes/api/cms/$.ts` calls `cms.fetch`. `integralAdmin()` in `vite.config.ts` (also keeps core external in SSR builds), and `src/routes/admin.$.ts` returns `#integral/admin-html` as a server route. Pages read content through `createServerFn` in loaders (loaders also run on the client). Nitro v3 via `nitro/vite`. Secrets come from `process.env` (`.env` loads in dev and `vite preview`).
- `examples/nuxt`: `integral.config.ts` calls `useRuntimeConfig()` (`NUXT_CMS_SECRET`, `NUXT_DATABASE_URL`); Nitro's auto-import transform covers root files. Pages use `useIntegral()`; there are no hand-written API routes.

## Design decisions

- **One JSON documents table** for all collections. Schema changes need no migration. Filters use `json_extract`, and field names are checked against the schema before they reach SQL. SonicJS does the same.
- **Core owns the fixed tables only.** Migrations come from drizzle-kit and are embedded as strings, so they run without a filesystem (Cloudflare later). They run lazily on the first DB access.
- **No module-level state.** Everything lives in the `defineCms()` closure, so several instances can coexist.
- **Lazy DB and auth.** Nothing connects at import time. The secret is checked when auth is first used, so public pages keep working with a bad config.
- **The admin is a compiled library the host bundles.** Core never imports it, so headless is free. Extensions come from `integral.admin.ts`, compiled by the host's Vite with HMR.
- **Extension contract is `mount(el, ctx)` only.** No framework components cross the boundary, so the admin bundles its own Vue and hosts install nothing. Reactivity is by callbacks: `ctx.onChange` in, `update(ctx)` out. New admin slots MUST use `Mount<Ctx>` too. Admin helpers go into `ctx.integral` (`IntegralContext`: `base`, `navigate`), never at the top level of a context.
- **One published package.** Framework adapters are subpath exports with optional peer deps (`astro`, `@nuxt/kit`, `@nuxt/schema`, `h3`, and `vue` / `react` / `react-dom` for the admin helpers).
- **SQLite only for now**, through libsql (a file or Turso). D1 and Postgres come later, behind the same `documents` shape.
- **Admin path is an adapter option** (`admin: '/cms'`, default `/admin`), not part of `integral.config.ts`: routes are registered at build time, before the config can load. `adminPath()` in `src/admin/html.ts` validates it; the page passes it to the admin router as `data-base`. `/api/cms` (`API_BASE`) stays fixed.
- **Reads are public, writes need a session.** Pages render the content anyway, and the Nuxt composable needs an HTTP read path for client-side navigation. Drafts will have to gate here later.

## Gotchas (each cost a debugging round)

- Nitro rewrites `typeof window` to `"undefined"` as plain text, even inside strings. Keep browser-only code out of server bundles.
- libsql loads `@libsql/<platform>` with a dynamic require:
  - If Vite bundles core, the native binding breaks. That's why the Astro adapter and `integralAdmin()` set core as `ssr.external` in builds. Dev does not bundle, so it stays internal there and Vite reloads it.
  - Nitro's tracer misses the binary. That's why the Nuxt module adds `traceInclude`.
- `tsdown --watch` MUST run with `--no-clean`. Otherwise Nitro rebuilds while `dist/` is empty and logs ENOENT errors. Never run `build:packages` while the watcher runs: the core build deletes `dist/` (including `dist/admin`) under the watcher.
- `Object.assign(el, { dataset: ... })` throws: `dataset` is a getter. Use `setAttribute`.
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
- TanStack Start throws `multiple entries detected` on a second client entry. `integralAdmin()` sets `isEntry = false` on the admin chunk in `generateBundle`, before Start's post hook reads it.
- `configureServer` also runs during `vite build` (TanStack/Nitro). Check `this.environment.config.command === 'serve'`, not whether a server exists.
- Dev servers bind `[::1]` and `curl localhost` hits them first. Test a production build on `HOST=127.0.0.1` and another port, with its own `DATABASE_URL`, or you test a leftover dev server and write into its DB.
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
- Admin UI: plain Vue SFCs with `<script setup>`, Tailwind classes, and the shared `.input` / `.btn` / `.btn-ghost` classes in `style.css`. Host inputs render in the admin's light DOM, so they can use those classes too.
- Versions in use: Astro 7, Nuxt 4.5 (nitropack 2, h3 v1), TanStack Start 1.168 (nitro 3 beta, React 19), Vite 8, TypeScript 6, better-auth 1.7, drizzle-orm 0.45, Hono 4, zod 4.

## Next up

Live preview is the next feature: a `preview: (doc) => url` option per collection, an iframe in `DocEdit.vue`, and a draft cookie read by `find`. The full ordered roadmap is in README.md.
