# integral-cms

A CMS that lives **inside** your Vite-based app. One repo, one deployment, one database file.

> Status: proof of concept. Works with Astro and Nuxt on Node. Not published to npm yet.

## Why

Headless CMSs are framework-agnostic because they talk REST or GraphQL. The price: a second service with its own deployment, Docker setup and a Postgres or MySQL server.

integral-cms takes the other route, like Pruvious (Nuxt) and Payload 3 (Next.js), but for any framework built on Vite:

- **Part of your app.** The admin UI and API are routes in your app. No second service.
- **Schema in code.** Collections and globals are TypeScript. Types flow into your pages.
- **Local API.** Server code calls `cms.find('posts')` directly. No HTTP round trip.
- **SQLite first.** A file on disk, or Turso via libsql. Cloudflare D1 is planned.
- **No style clashes.** The admin is its own HTML document at `/admin` and never touches your site's CSS.
- **Web standards.** The core is a [Hono](https://hono.dev) app: `Request` in, `Response` out. Framework adapters are a few lines.

## Quickstart

Requires Node 22.14+ and pnpm.

```sh
pnpm install

cp examples/astro/.env.example examples/astro/.env   # set CMS_SECRET (32+ chars)
pnpm dev:astro                                        # http://localhost:4321/admin

cp examples/nuxt/.env.example examples/nuxt/.env     # set NUXT_CMS_SECRET (32+ chars)
pnpm dev:nuxt                                         # http://localhost:3000/admin
```

Generate a secret with `openssl rand -hex 32`.

On first visit, choose "Create the admin account". Only the first user can sign up.

## Usage

### 1. Define the schema and create the instance

```ts
import { createCms, defineConfig } from 'integral-cms'

const config = defineConfig({
  collections: {
    posts: {
      label: 'Posts',
      titleField: 'title',
      fields: {
        title: { type: 'text', required: true },
        slug: { type: 'text', required: true },
        publishedAt: { type: 'date' },
        category: { type: 'select', options: ['news', 'guide'] },
        featured: { type: 'boolean' },
        body: { type: 'textarea' },
      },
    },
  },
  globals: {
    site: { fields: { title: { type: 'text', required: true } } },
  },
})

export const cms = createCms({
  config,
  database: { url: 'file:/absolute/path/cms.db' }, // or libsql://…, plus authToken
  secret: process.env.CMS_SECRET!, // at least 32 characters
})
```

Field types: `text`, `textarea`, `number`, `boolean`, `date`, `select`.

### 2. Read content

```ts
await cms.find('posts')                                   // all, newest first
await cms.find('posts', { where: { category: 'news' } })   // equality filters
await cms.findOne('posts', { where: { slug: 'hello' } })
await cms.findById('posts', id)
await cms.getGlobal('site')
```

Everything is typed from the schema. Unknown collections or fields are type errors.

### Astro

```ts
// astro.config.ts: needs an SSR adapter, e.g. @astrojs/node
import integralCms from 'integral-cms/astro'

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [integralCms()], // reads ./src/cms.ts, option: { entry }
})
```

```astro
---
import { cms } from '../cms'
export const prerender = false
const posts = await cms.find('posts')
---
```

Pages with `prerender = false` read live content. Prerendered pages read content at build time.
Secrets go through `astro:env`; see `examples/astro/astro.config.ts`.

### Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['integral-cms/nuxt'], // reads ./server/cms.ts, option: integralCms: { entry }
  runtimeConfig: { cmsSecret: '', databaseUrl: `file:${resolve('cms.db')}` },
})
```

```ts
// server/api/posts.get.ts
import { cms } from '../cms'
export default defineEventHandler(() => cms.find('posts'))
```

Pages load data with `useFetch('/api/posts')`. The types flow through.

### Any other framework

Send `/admin/*` and `/api/cms/*` to `cms.fetch(request)`.

## Environment and deployment

- `dev` and `preview` load `.env` in both examples. The examples' `start` scripts pass `--env-file-if-exists=.env` to Node.
- In production, set variables in your host or process manager.
- **Use an absolute database path or a `libsql://` URL in production.** A relative `file:` path resolves against the working directory. For example, `nuxt preview` runs from `.output/`, which every build deletes.
- Build on the same OS and CPU you deploy to. libsql ships a native binary per platform.

## Project layout

```
packages/core    integral-cms: schema, Hono app, local API, auth, Astro integration, Nuxt module
packages/admin   Vue 3 + Tailwind admin SPA, bundled into core at build time (private)
examples/astro   Astro 7 app, mixing prerendered pages and SSR pages, on @astrojs/node
examples/nuxt    Nuxt 4 app
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev:astro` / `pnpm dev:nuxt` | Build packages, start the example |
| `pnpm build` | Build packages and both examples |
| `pnpm typecheck` | Type-check everything |
| `pnpm --filter integral-cms db:generate` | New migration after editing `packages/core/src/db/schema.ts` |

## Status

Working:

- Schema-in-code collections and globals with inferred types
- Admin: list, create, edit, delete; globals; email/password login
- Validation at the API (zod), CSRF protection, first-user-only sign-up
- Astro integration and Nuxt module; dev, preview and production on Node
- SQLite via libsql (local file or Turso)

Roadmap, roughly in order:

1. Live preview: `preview: (doc) => url` per collection, iframe in the editor, draft cookie
2. Drafts and published versions
3. Media uploads with a storage adapter (local disk, S3/R2)
4. Rich text (format still open: Tiptap JSON or Markdown)
5. Relations between collections
6. Invites, roles and access control
7. Plugin hooks (`beforeChange`, `afterChange`, extra fields)
8. Cloudflare Workers: D1 driver, per-request bindings
9. Postgres
10. SvelteKit adapter
11. Publish to npm

## Prior art

- [Pruvious](https://pruvious.com): the Nuxt-integrated CMS this idea comes from
- [Payload 3](https://payloadcms.com): schema in code, embedded in Next.js, Drizzle adapters
- [SonicJS](https://sonicjs.com): Hono + D1 + Drizzle, one JSON documents table
- [Keystatic](https://keystatic.com): clean Astro integration, files in git
- [Sveltia CMS](https://github.com/sveltia/sveltia-cms): git-based; its field widgets are worth a look
