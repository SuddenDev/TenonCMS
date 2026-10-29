# Examples

Every example has its instance in `integral.config.ts` at the project root and its collections in `collections/`. Each registers `ExamplePlugin()`: Astro and standalone use the plain DOM renderer, Nuxt Vue and TanStack Start React. All use the pages preset, and the site examples have a catch-all route that reads a page by `path` and renders `seoMeta()`.

| Example                   | What it shows                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/astro`          | The fullest one. Server-rendered pages through `Astro.locals`, localization (`en`, `de`), a kitchen-sink global with every field type, access rules, a custom role, `RedirectsPlugin()`, media, blocks, live preview. |
| `examples/astro-pglite`   | Astro on Node with PGlite: Postgres in WebAssembly, stored in `./.data/cms` (`DATABASE_DIR`). Posts, authors and media, like the Cloudflare example. Port 4322.                                                       |
| `examples/nuxt`           | `useIntegral()` composables, localization with the same setup as Astro, runtime config for secrets, Vue admin renderer.                                                                                               |
| `examples/tanstack-start` | No adapter package: `integralAdmin()`, a server route for the API and one for the admin, server functions in loaders, React admin renderer.                                                                           |
| `examples/standalone`     | Headless: no site. API and admin on Vite and Nitro. Has media with `ipx()` and an `array` field.                                                                                                                      |
| `examples/cloudflare`     | Astro on Cloudflare: the CMS in a Durable Object, pages read through the client over it. Posts, authors, media in R2 with Cloudflare Images. Secret in `.dev.vars` (copy `.dev.vars.example`).                        |
| `examples/vercel`         | Astro on Vercel Node functions: Postgres through `postgres()` with `attachDatabasePool()`, media in AWS S3 from the Vercel Marketplace (`s3()` with OIDC `credentials`), rate limits in the database. Port 4323.      |

## Astro in more detail

- The **kitchen-sink** global holds every field type except `join` (globals cannot hold joins), plus every option and layout feature. Extend it whenever you add a field type or option.
- **Comments** is the access-rule example: visitors can create, readers see only approved ones, only `admin` and `editor` can moderate. The post page lists them and handles its own form post.
- A `strings` global (the `strings()` preset) holds translated site text.
- The post and kitchen-sink pages are server-rendered, so new posts show in dev without a restart.

## Cloudflare in more detail

- `src/worker.ts` is the Worker entry: it exports `CmsObject` and hands requests to Astro.
- `pnpm run deploy` builds and deploys (plain `pnpm deploy` is a pnpm command of its own). `wrangler deploy` alone uploads the last build: it reads `dist/server/wrangler.json`, which `astro build` writes.
- Cloudflare defaults throughout: R2 binding `MEDIA` (`r2()`), Images binding `IMAGES` (`cloudflare({ binding })`), and the adapter's KV `SESSION`. The bindings have no IDs, so `wrangler dev` simulates them and `wrangler deploy` creates them. R2 MUST be enabled on the account first (see [gotchas](gotchas.md)).
- Server bundle (2026-10-28, minified): 2.0 MB, 577 KB gzipped.
- Smoke test the build without touching the example's state: `astro build`, then `wrangler dev -c dist/server/wrangler.json --persist-to <temp dir>`. Uploads to `r2()` MUST send each part's `etag` to `complete`.

## Vercel in more detail

- Vercel project: root directory `examples/vercel`, build command `cd ../.. && pnpm build:packages && pnpm --filter example-vercel build`, because the example consumes core's `dist/`.
- Add Neon (use the pooled connection string as `DATABASE_URL`) and AWS S3 from the Vercel Marketplace. S3 sets `AWS_REGION`, `AWS_ROLE_ARN` and `S3_BUCKET_NAME`. Set `MEDIA_URL` to the bucket's public URL and `CMS_SECRET` yourself. The bucket needs CORS (`PUT` from the site, expose `ETag`) and public reads.
- `vercel env pull` writes the variables and a `VERCEL_OIDC_TOKEN` to `.env.local`, so local runs reach the bucket.
- `site` stays unset: better-auth reads the base URL from the request, so preview URLs work. Passkeys bind to the host they were made on.
- `astro build` writes `.vercel/output`. The function (2026-10-29): 39 MB, with `integral-cms`, `kysely`, `pg` and `sharp` traced by nft. No libsql.
- Smoke test without Vercel: a temp Postgres as `DATABASE_URL` and dummy S3 variables. Credentials are only fetched on the first signed request, so everything except uploads works.

## Conventions

- Secrets come from the environment (Astro env, `process.env`, or Nuxt runtime config).
- Admin pages that are reachable only by URL use `nav: { display: "none" }`.
- Smoke-test an example with the [smoke tests](smoke-tests.md). Examples and adapters have no automated tests yet.
