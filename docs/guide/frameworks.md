# Framework setup

Every setup does the same three things: send `/_tenon/*` to the CMS, serve the admin page at `/admin`, and make the instance from `tenon.config.ts` available to your pages. Astro and Nuxt have an adapter that does this for you. For other Vite frameworks, use `tenonAdmin()`.

| Framework                             | Setup                                  |
| ------------------------------------- | -------------------------------------- |
| [Astro](#astro)                       | `tenoncms/astro` integration           |
| [Nuxt](#nuxt)                         | `tenoncms/nuxt` module                 |
| [TanStack Start](#tanstack-start)     | `tenonAdmin()` plus two server routes  |
| [Anything else](#any-other-framework) | `cms.fetch(request)` and an admin page |

To serve the admin under another path, pass `admin: '/cms'` to the Astro integration or the Nuxt module. Pass `admin: false` to ship no admin at all.

The CMS also serves `/sitemap.xml` and `/robots.txt` (see [Pages and SEO](pages-and-seo.md#sitemap-and-robotstxt)). Astro and Nuxt mount them, unless your project serves the path itself. `sitemap: false` and `robots: false` skip them. Other hosts send both paths to `cms.fetch(request)`.

## Astro

```ts
// astro.config.ts: needs an SSR adapter, e.g. @astrojs/node
import tenonCms from "tenoncms/astro";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  integrations: [tenonCms()], // reads ./tenon.config.ts, options: { entry, admin }
});
```

The integration adds a middleware that exposes the instance as `Astro.locals.tenon`, fully typed. It is `cms.withSession(request)`, so the admin's preview sees drafts. Prerendered pages and `/_tenon` get the plain instance.

```astro
---
export const prerender = false;
const posts = await Astro.locals.tenon.find("posts");
---
```

- Pages with `prerender = false` read live content. Prerendered pages read content at build time.
- Secrets go through `astro:env`. See `examples/astro/tenon.config.ts`.

### Astro on Cloudflare

With `@astrojs/cloudflare` as the adapter, the CMS runs inside a Durable Object. The integration detects the adapter. See `examples/cloudflare`.

```ts
// tenon.config.ts
import { durableObject } from "tenoncms/cloudflare";
export default defineCms({ database: durableObject(), secret: CMS_SECRET /* ... */ });

// src/worker.ts, set as `main` in wrangler.jsonc
import { handle } from "@astrojs/cloudflare/handler";
import { tenonObject } from "tenoncms/cloudflare";
import cms from "../tenon.config";

export const CmsObject = tenonObject(cms);
export default { fetch: handle } satisfies ExportedHandler<Env>;
```

```jsonc
// wrangler.jsonc
"main": "./src/worker.ts",
"durable_objects": { "bindings": [{ "name": "CMS", "class_name": "CmsObject" }] },
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["CmsObject"] }],
```

- The binding MUST be named `CMS`. All content lives in one object, `env.CMS.getByName("cms")`.
- `Astro.locals.tenon` is the [HTTP client](reading.md) over the object, not the local API. It forwards the request's cookie, so the session user's access rules apply, and the preview cookie shows drafts. Compared with the local API: no `withSession()` or `withDrafts()` (the cookie decides), `localization()` is an async method, new drafts go through `createDraft()`, and there is no `email` or `auth`. Writes need a session or an API key.
- Pages that read the CMS MUST NOT be prerendered: no object exists at build time. Set `output: "server"`. A prerendered page that reads it fails the build.
- The server bundle is minified, because every wake of the object parses it again.
- Media: `r2(env.MEDIA)` and `cloudflare({ binding: env.IMAGES })`, with `env` from `cloudflare:workers`. See [media](media.md#r2). The adapter adds the `IMAGES` binding and a KV `SESSION` binding by default; `wrangler deploy` creates the bucket and namespace for bindings without an ID, once R2 is enabled on the account.

### Astro on Vercel

With `@astrojs/vercel` as the adapter, the CMS runs in Vercel's Node functions. The integration needs no extra options. See `examples/vercel`.

```ts
// tenon.config.ts
import { attachDatabasePool } from "@vercel/functions";
import { s3 } from "tenoncms/media/s3";
import { postgres } from "tenoncms/postgres";

const database = postgres(DATABASE_URL);
attachDatabasePool(database.pool);

export default defineCms({
  database,
  media: {
    storage: s3({
      bucket: S3_BUCKET,
      region: AWS_REGION,
      endpoint: AWS_ENDPOINT_URL_S3,
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    }),
  },
  // ...
});
```

- Database: Postgres, for example Neon. Use its pooled connection string. `attachDatabasePool()` closes idle connections before Vercel suspends the function.
- Media: the function's disk is read-only, so the default media on the local disk does not work. Without a `media` option there is no media library, and `media: true` throws. Use `s3()` with any S3-compatible bucket, or `r2()` with keys. See [media](media.md#s3-and-r2). The browser uploads straight to the bucket, so Vercel's 4.5 MB request limit does not apply. The bucket needs CORS. Without `publicUrl` it stays private: the function serves files, and Vercel's CDN keeps them for an hour.
- Rate limits: core keeps them in the database, so instances share them. `auth: { rateLimit: { storage: "memory" } }` turns that off.
- Leave `site` unset if you use preview deployments. Passkeys only work on the host they were created on.
- In a monorepo, the build command MUST build the CMS packages first.

#### With Neon

Neon has Postgres and S3-compatible object storage in one project.

1. Create a Neon project in the region of your Vercel functions, for example `aws-eu-central-1` for `fra1`.
2. Copy the pooled connection string (host with `-pooler`) as `DATABASE_URL`.
3. Create a bucket in the project's object storage and keep its access private. Copy the S3 endpoint, access key, secret key and region as `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`, and the bucket name as `S3_BUCKET`.
4. CORS: a new Neon bucket allows `PUT` from every origin and exposes `ETag`, which uploads need. To limit it to your site, send `PutBucketCors` with the S3 API.
5. In Vercel, set those variables and `CMS_SECRET` (`openssl rand -hex 32`). Deploy, open `/admin` and create the first admin.

Neon stores lifecycle rules but does not run them, so unfinished multipart uploads are not cleaned up by the bucket. Each Neon branch has its own buckets.

## Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["tenoncms/nuxt"], // reads ./tenon.config.ts, options: tenonCms: { entry, admin }
  runtimeConfig: { cmsSecret: "", databaseUrl: `file:${resolve("cms.db")}` },
});
```

`tenon.config.ts` can call `useRuntimeConfig()` for the secret and the database URL.

The module auto-imports `useTenon()`. It has the read methods of the client (`find`, `findOne`, `findById`, `getGlobal`) but returns `useAsyncData` results. `useTenonSeo()` ([Pages and SEO](pages-and-seo.md#in-nuxt)), `useLocale()`, `useAlternates()` ([Localization](localization.md)), `useLivePreview()` ([Live preview](live-preview.md#check-for-the-live-preview)) and `useBlockEdit()` are auto-imported too, and so are the components `TenonImage`, `TenonPicture`, `TenonLink`, `TenonBlocks` and `TenonRichtext` ([Components](components.md)).

- During SSR it calls the CMS in-process. On client-side navigation it fetches the public read API.
- Read options and document ids accept refs or getters. Use a getter for route-dependent filters, so reused pages update on navigation. The route's locale updates automatically.
- `useTenonSeo(page)` fills the head from the document. With `seoMeta()` yourself, keep it in a computed and pass getters to `useHead()` or `useSeoMeta()`, so the head follows the document.

```vue
<script setup lang="ts">
const { data: posts } = await useTenon().find("posts");
const { data: post } = await useTenon().findOne("posts", { where: { slug: "hello" } });
const route = useRoute();
const { data: current } = await useTenon().findOne(
  "posts",
  () =>
    ({
      where: { slug: String(route.params.slug) },
      alternates: true,
    }) as const,
);
useAlternates(() => current.value?.alternates);
</script>
```

Server routes can import the instance as the default export of `#tenon/config` (an alias for `tenon.config.ts`) for writes or custom queries.

## TanStack Start

No module is needed. A splat server route hands API requests to the CMS, `tenonAdmin()` builds the admin, and a second server route serves its page.

```ts
// src/routes/[_]tenon.$.ts
// The brackets escape the `_`. A plain `_tenon` file is a pathless layout route.
const handle = ({ request }: { request: Request }) => cms.fetch(request);

export const Route = createFileRoute("/_tenon/$")({
  server: { handlers: { GET: handle, POST: handle, PUT: handle, DELETE: handle } },
});
```

```ts
// vite.config.ts
import { tenonAdmin } from "tenoncms/vite";

export default defineConfig({ plugins: [tanstackStart(), nitro(), viteReact(), tenonAdmin()] });
```

```ts
// src/routes/admin.$.ts
import html from "#tenon/admin-html";

export const Route = createFileRoute("/admin/$")({
  server: {
    handlers: {
      GET: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
    },
  },
});
```

Two more routes serve the sitemap and `robots.txt`. The brackets escape the dot:

```ts
// src/routes/sitemap[.]xml.ts, and the same for robots[.]txt.ts with "/robots.txt"
export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: ({ request }) => cms.fetch(request) } },
});
```

Loaders run on the client and the server, so read content in a server function:

```tsx
// src/routes/index.tsx
import cms from "../../tenon.config";

const getPosts = createServerFn().handler(() => cms.find("posts"));

export const Route = createFileRoute("/")({ loader: () => getPosts(), component: Home });
```

`tenonAdmin()` also keeps `tenoncms` external in the SSR build, because bundling it breaks libsql's native binding. To use another admin path, pass `tenonAdmin({ path: '/cms' })` and name the route file to match (`src/routes/cms.$.ts`).

## Any other framework

Send `/_tenon/*`, `/sitemap.xml` and `/robots.txt` to `cms.fetch(request)`.

- **With Vite**: use `tenonAdmin()` as in TanStack Start, and return `#tenon/admin-html` for `/admin` and `/admin/*`.
- **Without Vite**: serve a page of its own with an empty element, and mount the admin into it:

```ts
import { mountAdmin } from "tenoncms/admin/mount";

mountAdmin("#admin");
```
