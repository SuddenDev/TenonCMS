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
