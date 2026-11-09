# Examples

The Astro kitchen-sink price uses `kitchen-sink.client.ts` for reactive help. Nuxt, TanStack Start and standalone posts use `posts.client.ts` for title help, exercising typed references in each adapter.
Every example has its instance in `tenon.config.ts` at the project root and its collections in `collections/`. Each registers `ExamplePlugin()`: Astro and standalone use the plain DOM renderer, Nuxt Vue and TanStack Start React. Astro, Nuxt, TanStack Start and standalone use `pagesPreset({ seo: true, blocks })` from `defineCms({ presets })`, with a `text` block (Astro adds `hero` and `section`), and the site examples have a catch-all route that reads a page by `path` and renders `seoMeta()`.

| Example                   | What it shows                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/astro`          | The fullest one. Server-rendered pages through `Astro.locals`, localization (`en`, `de`), a kitchen-sink global with every field type, access rules, a custom role, `RedirectsPlugin()`, media, blocks, shared blocks with a `section` that nests itself (`src/components/Blocks.astro` renders it), live preview, passkeys. |
| `examples/astro-pglite`   | Astro on Node with PGlite: Postgres in WebAssembly, stored in `./.data/cms` (`DATABASE_DIR`). Posts, authors and media, like the Cloudflare example. Port 4322.                                                                                                                                                              |
| `examples/nuxt`           | `useTenon()` composables, `useTenonSeo()` and `TenonBlocks` with `useBlockEdit()` in the catch-all page, localization with the same setup as Astro, runtime config for secrets, Vue admin renderer.                                                                                                                          |
| `examples/tanstack-start` | No adapter package: `tenonAdmin()`, server routes for the API, the admin, `/sitemap.xml` and `/robots.txt`, server functions in loaders, React admin renderer.                                                                                                                                                               |
| `examples/standalone`     | Headless: no site. API and admin on Vite and Nitro. Has media with `ipx()` and an `array` field.                                                                                                                                                                                                                             |
| `examples/cloudflare`     | Astro on Cloudflare: the CMS in a Durable Object, pages read through the client over it. Posts, authors, media in R2 with Cloudflare Images. Secret in `.dev.vars` (copy `.dev.vars.example`).                                                                                                                               |
| `examples/vercel`         | Astro on Vercel Node functions: Postgres through `postgres()` with `attachDatabasePool()`, media in a private Neon bucket through `s3()` with keys. Port 4323.                                                                                                                                                               |

## Astro in more detail

- The **kitchen-sink** global holds every field type except `join` (globals cannot hold joins), plus every option and layout feature. Extend it whenever you add a field type or option.
- **Comments** is the access-rule example: visitors can create, readers see only approved ones, only `admin` and `editor` can moderate. The post page lists them and handles its own form post.
- A `strings` global (the `strings()` preset) holds translated site text.
- The post and kitchen-sink pages are server-rendered, so new posts show in dev without a restart.

## Cloudflare in more detail

- `src/worker.ts` is the Worker entry: it exports `CmsObject` and hands requests to Astro.
- `pnpm run deploy` builds and deploys (plain `pnpm deploy` is a pnpm command of its own). `wrangler deploy` alone uploads the last build: it reads `dist/server/wrangler.json`, which `astro build` writes.
- Cloudflare defaults throughout: R2 binding `MEDIA` (`r2()`), Images binding `IMAGES` (`cloudflare({ binding })`), and the adapter's KV `SESSION`. The bindings have no IDs, so `wrangler dev` simulates them and `wrangler deploy` creates them. R2 MUST be enabled on the account first (see [gotchas](gotchas.md)).
- Server bundle (2026-10-29, minified, `wrangler deploy --dry-run`): 1,623 KiB, 470 KiB gzipped. Passkeys are off, so no WebAuthn libraries.
- Smoke test the build without touching the example's state: `astro build`, then `wrangler dev -c dist/server/wrangler.json --persist-to <temp dir>`. Uploads to `r2()` MUST send each part's `etag` to `complete`.

## Vercel in more detail

- Vercel project: root directory `examples/vercel`, build command `cd ../.. && pnpm build:packages && pnpm --filter example-vercel build`, because the example consumes core's `dist/`.
  - Set `ENABLE_EXPERIMENTAL_COREPACK=1`, or Vercel ignores `packageManager` and installs with its own pnpm.
- Set up Neon as in the [guide](../guide/frameworks.md#with-neon): the pooled `DATABASE_URL`, a private bucket and its S3 variables (`AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`), and `CMS_SECRET`. The same variables in `.env` work locally.
- Vercel allows the `AWS_*` key names and injects unusable ones when they are unset, so all of them MUST be set.
- `site` stays unset: better-auth reads the base URL from the request, so preview URLs work. Passkeys bind to the host they were made on.
- `astro build` writes `.vercel/output`. The function (2026-10-29): 39 MB, with `tenoncms`, `kysely`, `pg` and `sharp` traced by nft. No libsql.
- Smoke test without Vercel: a temp Postgres as `DATABASE_URL` and dummy S3 variables; everything except uploads works. With a real bucket, run `s3.live.test.ts` against it too (`S3_TEST_*` variables).
- Neon checked on 2026-10-29: `s3.live.test.ts` passes, and an upload through presigned parts, the file and a variant served by core work.

## Conventions

- Secrets come from the environment (Astro env, `process.env`, or Nuxt runtime config).
- Admin pages that are reachable only by URL use `nav: { display: "none" }`.
- Smoke-test an example with the [smoke tests](smoke-tests.md). Examples and adapters have no automated tests yet.
