# Framework setup

Every setup does the same three things: send `/api/cms/*` to the CMS, serve the admin page at `/admin`, and make the instance from `integral.config.ts` available to your pages. Astro and Nuxt have an adapter that does this for you. For other Vite frameworks, use `integralAdmin()`.

| Framework                             | Setup                                    |
| ------------------------------------- | ---------------------------------------- |
| [Astro](#astro)                       | `integral-cms/astro` integration         |
| [Nuxt](#nuxt)                         | `integral-cms/nuxt` module               |
| [TanStack Start](#tanstack-start)     | `integralAdmin()` plus two server routes |
| [Anything else](#any-other-framework) | `cms.fetch(request)` and an admin page   |

To serve the admin under another path, pass `admin: '/cms'` to the Astro integration or the Nuxt module. Pass `admin: false` to ship no admin at all.

## Astro

```ts
// astro.config.ts: needs an SSR adapter, e.g. @astrojs/node
import integralCms from "integral-cms/astro";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  integrations: [integralCms()], // reads ./integral.config.ts, options: { entry, admin }
});
```

The integration adds a middleware that exposes the instance as `Astro.locals.integral`, fully typed. It is `cms.withSession(request)`, so the admin's preview sees drafts. Prerendered pages and `/api/cms` get the plain instance.

```astro
---
export const prerender = false;
const posts = await Astro.locals.integral.find("posts");
---
```

- Pages with `prerender = false` read live content. Prerendered pages read content at build time.
- Secrets go through `astro:env`. See `examples/astro/integral.config.ts`.

### Astro on Cloudflare

With `@astrojs/cloudflare` as the adapter, the CMS runs inside a Durable Object. The integration detects the adapter. See `examples/cloudflare`.

```ts
// integral.config.ts
import { durableObject } from "integral-cms/cloudflare";
export default defineCms({ database: durableObject(), secret: CMS_SECRET /* ... */ });

// src/worker.ts, set as `main` in wrangler.jsonc
import { handle } from "@astrojs/cloudflare/handler";
import { integralObject } from "integral-cms/cloudflare";
import cms from "../integral.config";

export const CmsObject = integralObject(cms);
export default { fetch: handle } satisfies ExportedHandler<Env>;
```

```jsonc
// wrangler.jsonc
"main": "./src/worker.ts",
"durable_objects": { "bindings": [{ "name": "CMS", "class_name": "CmsObject" }] },
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["CmsObject"] }],
```

- The binding MUST be named `CMS`. All content lives in one object, `env.CMS.getByName("cms")`.
- `Astro.locals.integral` is the [HTTP client](reading.md) over the object, not the local API. It forwards the request's cookie, so the session user's access rules apply, and the preview cookie shows drafts. Compared with the local API: no `withSession()` or `withDrafts()` (the cookie decides), `localization()` is an async method, new drafts go through `createDraft()`, and there is no `email` or `auth`. Writes need a session or an API key.
- Pages that read the CMS MUST NOT be prerendered: no object exists at build time. Set `output: "server"`. A prerendered page that reads it fails the build.
- The server bundle is minified, because every wake of the object parses it again.
- Media: `r2(env.MEDIA)` and `cloudflare({ binding: env.IMAGES })`, with `env` from `cloudflare:workers`. See [media](media.md#r2). The adapter adds the `IMAGES` binding and a KV `SESSION` binding by default; `wrangler deploy` creates the bucket and namespace for bindings without an ID, once R2 is enabled on the account.

### Astro on Vercel

With `@astrojs/vercel` as the adapter, the CMS runs in Vercel's Node functions. The integration needs no extra options. See `examples/vercel`.

```ts
// integral.config.ts
import { attachDatabasePool } from "@vercel/functions";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { s3 } from "integral-cms/media/s3";
import { postgres } from "integral-cms/postgres";

const database = postgres(DATABASE_URL);
attachDatabasePool(database.pool);

export default defineCms({
  database,
  media: {
    storage: s3({
      bucket: S3_BUCKET_NAME,
      region: AWS_REGION,
      publicUrl: MEDIA_URL,
      credentials: awsCredentialsProvider({ roleArn: AWS_ROLE_ARN }),
    }),
  },
  // ...
});
```

- Database: Postgres, for example Neon from the Vercel Marketplace. Use its pooled connection string. `attachDatabasePool()` closes idle connections before Vercel suspends the function.
- Media: the function's disk is read-only, so the default media on the local disk does not work. Without a `media` option there is no media library, and `media: true` throws. Use `s3()` (AWS S3 from the Vercel Marketplace with `credentials` as above, or any S3-compatible bucket with keys) or `r2()` with keys. See [media](media.md#s3-and-r2). The browser uploads straight to the bucket, so Vercel's 4.5 MB request limit does not apply. The bucket needs CORS and a public URL.
- Rate limits: core keeps them in the database, so instances share them. `auth: { rateLimit: { storage: "memory" } }` turns that off.
- Leave `site` unset if you use preview deployments. Passkeys only work on the host they were created on.
- In a monorepo, the build command MUST build the CMS packages first.

## Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["integral-cms/nuxt"], // reads ./integral.config.ts, options: integralCms: { entry, admin }
  runtimeConfig: { cmsSecret: "", databaseUrl: `file:${resolve("cms.db")}` },
});
```

`integral.config.ts` can call `useRuntimeConfig()` for the secret and the database URL.

The module auto-imports `useIntegral()`. It has the read methods of the client (`find`, `findOne`, `findById`, `getGlobal`) but returns `useAsyncData` results.

- During SSR it calls the CMS in-process. On client-side navigation it fetches the public read API.
- Read options and document ids accept refs or getters. Use a getter for route-dependent filters, so reused pages update on navigation. The route's locale updates automatically.
- Keep `seoMeta()` in a computed and pass getters to `useHead()` or `useSeoMeta()`, so the head follows the document.

```vue
<script setup lang="ts">
const { data: posts } = await useIntegral().find("posts");
const { data: post } = await useIntegral().findOne("posts", { where: { slug: "hello" } });
const route = useRoute();
const { data: current } = await useIntegral().findOne(
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

Server routes can import the instance as the default export of `#integral/config` (an alias for `integral.config.ts`) for writes or custom queries.

## TanStack Start

No module is needed. A splat server route hands API requests to the CMS, `integralAdmin()` builds the admin, and a second server route serves its page.

```ts
// src/routes/api/cms/$.ts
const handle = ({ request }: { request: Request }) => cms.fetch(request);

export const Route = createFileRoute("/api/cms/$")({
  server: { handlers: { GET: handle, POST: handle, PUT: handle, DELETE: handle } },
});
```

```ts
// vite.config.ts
import { integralAdmin } from "integral-cms/vite";

export default defineConfig({ plugins: [tanstackStart(), nitro(), viteReact(), integralAdmin()] });
```

```ts
// src/routes/admin.$.ts
import html from "#integral/admin-html";

export const Route = createFileRoute("/admin/$")({
  server: {
    handlers: {
      GET: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
    },
  },
});
```

Loaders run on the client and the server, so read content in a server function:

```tsx
// src/routes/index.tsx
import cms from "../../integral.config";

const getPosts = createServerFn().handler(() => cms.find("posts"));

export const Route = createFileRoute("/")({ loader: () => getPosts(), component: Home });
```

`integralAdmin()` also keeps `integral-cms` external in the SSR build, because bundling it breaks libsql's native binding. To use another admin path, pass `integralAdmin({ path: '/cms' })` and name the route file to match (`src/routes/cms.$.ts`).

## Any other framework

Send `/api/cms/*` to `cms.fetch(request)`.

- **With Vite**: use `integralAdmin()` as in TanStack Start, and return `#integral/admin-html` for `/admin` and `/admin/*`.
- **Without Vite**: serve a page of its own with an empty element, and mount the admin into it:

```ts
import { mountAdmin } from "integral-cms/admin/mount";

mountAdmin("#admin");
```
