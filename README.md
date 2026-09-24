# integral-cms

A CMS that lives **inside** your Vite-based app. One repo, one deployment, one database file.

> Status: proof of concept. Works with Astro, Nuxt and TanStack Start on Node. Not published to npm yet.

## Why

Headless CMSs are framework-agnostic because they talk REST or GraphQL. The price: a second service with its own deployment, Docker setup and a Postgres or MySQL server.

integral-cms takes the other route, like Pruvious (Nuxt) and Payload 3 (Next.js), but for any framework built on Vite:

- **Part of your app.** The admin UI and API are routes in your app. No second service.
- **Schema in code.** Collections and globals are TypeScript. Types flow into your pages.
- **Local API.** Server code calls `cms.find('posts')` directly. No HTTP round trip.
- **SQLite first.** A file on disk, or Turso via libsql. Cloudflare D1 is planned.
- **Your bundle, your admin.** The admin is a Vue app that your Vite bundles. Add field inputs or styles from one file, or leave it out and go headless.
- **Web standards.** The core is a [Hono](https://hono.dev) app: `Request` in, `Response` out. Framework adapters are a few lines.

## Quickstart

Requires Node 22.14+ and pnpm.

```sh
pnpm install

cp examples/astro/.env.example examples/astro/.env   # set CMS_SECRET (32+ chars)
pnpm dev:astro                                        # http://localhost:4321/admin

cp examples/nuxt/.env.example examples/nuxt/.env     # set NUXT_CMS_SECRET (32+ chars)
pnpm dev:nuxt                                         # http://localhost:3000/admin

cp examples/tanstack-start/.env.example examples/tanstack-start/.env   # set CMS_SECRET (32+ chars)
pnpm dev:tanstack                                     # http://localhost:3100/admin
```

Generate a secret with `openssl rand -hex 32`.

On first visit, choose "Create the admin account". Only the first user can sign up.

## Usage

### 1. Define the schema and create the instance

`integral.config.ts` in the project root exports the instance. Collections can live in their own files.

```ts
// collections/posts.ts
import { defineCollection } from 'integral-cms'

export const posts = defineCollection({
  label: 'Posts',
  titleField: 'title',
  fields: {
    title: { type: 'text', required: true },
    slug: { type: 'text', required: true },
    author: { type: 'relation', collection: 'authors' },
    publishedAt: { type: 'date' },
    category: { type: 'select', options: ['news', 'guide'] },
    featured: { type: 'boolean' },
    body: { type: 'textarea' },
  },
})
```

```ts
// collections/authors.ts
export const authors = defineCollection({
  titleField: 'name',
  fields: {
    name: { type: 'text', required: true },
    posts: { type: 'join', collection: 'posts', on: 'author' },
  },
})
```

```ts
// integral.config.ts
import { admin, twoFactor } from 'better-auth/plugins'
import { defineCms } from 'integral-cms'
import { authors } from './collections/authors'
import { posts } from './collections/posts'

export default defineCms({
  collections: { posts, authors },
  globals: { site: { fields: { title: { type: 'text', required: true } } } },
  database: { url: 'file:/absolute/path/cms.db' }, // or libsql://…, plus authToken
  secret: process.env.CMS_SECRET!, // at least 32 characters
  // Optional, see Auth below.
  auth: {
    plugins: [admin(), twoFactor()],
    databaseHooks: { user: { create: { after: sendWelcome } } },
    session: { expiresIn: 60 * 60 * 24 * 30 },
  },
})
```

Field types: `text`, `textarea`, `number`, `boolean`, `date`, `select`, `group`, `relation`, `join` (see [Relations](#relations)). `defineGlobal()` does the same for globals.

A `group` nests fields under one key and renders as one section in the admin:

```ts
seo: {
  type: 'group',
  label: 'SEO',
  fields: {
    title: { type: 'text' },
    description: { type: 'textarea' },
    noindex: { type: 'boolean' },
  },
}
```

- An optional group can be missing or `null`, so read it as `doc.seo?.title`.
- Inner `required` fields apply only when the group is present.
- The admin saves an optional group with only empty values as `null`.
- Filters (`where`, query strings) accept top-level fields only, not groups or their inner fields.

### 2. Read content

```ts
await cms.find('posts')                                   // all, newest first
await cms.find('posts', { where: { category: 'news' } })   // equality filters
await cms.find('posts', { limit: 5 })                      // the 5 newest
await cms.findOne('posts', { where: { slug: 'hello' } })
await cms.findById('posts', id)
await cms.getGlobal('site')
```

Everything is typed from the schema. Unknown collections or fields are type errors.

Reads are also available over HTTP without a session, because the site renders that content anyway.
Query params are equality filters, and `limit` caps the result: `GET /api/cms/collections/posts?slug=hello&limit=1`, `GET /api/cms/globals/site`. `?category=null` matches an empty or missing field, like `null` in `where`; an empty value (`?category=`) adds no filter.
`populate` and `depth` control [relations](#relations). Because of that, fields named `limit`, `populate` or `depth` cannot be filtered over HTTP.
Writes and the schema endpoint need an admin session.

In the browser (admin pages, islands, client components), `integral-cms/client` gives the same methods over HTTP, typed from your schema:

```ts
import { createClient } from 'integral-cms/client'

const client = createClient()
await client.find('posts', { where: { featured: true } })
await client.update('posts', id, post) // needs a session, so it works in admin pages
await client.getSession() // the signed-in admin, or null
```

The Astro and Nuxt adapters register your `cms` type, so `createClient()` needs no type argument. Without an adapter, add this to `tsconfig.json`:

```jsonc
"compilerOptions": {
  "types": ["integral-cms/register"],
  "paths": { "#integral/config": ["./integral.config.ts"] }
}
```

`createClient<typeof otherCms>()` overrides the registered type.

### Relations

Documents reference other documents. A `relation` stores ids, a `join` reads the other side:

```ts
author: { type: 'relation', collection: 'authors' }                    // m-1
tags: { type: 'relation', collection: 'tags', many: true }             // m-m
parent: { type: 'relation', collection: 'pages', onDelete: 'cascade' } // self-reference
posts: { type: 'join', collection: 'posts', on: 'author' }             // 1-m, on `authors`
```

| Field | Options | Where |
|---|---|---|
| `relation` | `collection` (target), `many`, `onDelete`, `label`, `required` | top level and in groups, in collections and globals; targets collections only |
| `join` | `collection` (source), `on` (path to a relation there, e.g. `author` or `seo.image`), `label` | top level of collections only; not stored |

- Ids live in the document JSON: a string, or a string array with `many`. Writes check that every id exists in the target collection and that a document does not reference itself (400). `many` arrays keep their order and reject duplicates. A required `many` relation needs at least one id.
- `defineCms` also checks `collection` and `join.on` at the type level: a typo shows as an error in `integral.config.ts`, naming the field path and the allowed values.
- `defineCms` throws at startup for an unknown target, a `join` whose `on` is not a relation to its own collection, `required` with `onDelete: 'set-null'`, a `join` in a global or group, `cascade` in a global, and `populate.depth` above `populate.maxDepth`.
- Filters accept single top-level relations (`where: { author: id }`), not `many` relations, relations in groups or joins.
- `create` and `update` return ids.

Reads resolve relations into documents:

```ts
cms.find('posts')                                         // every relation, default depth
cms.find('posts', { depth: 1 })
cms.find('posts', { populate: false })                    // ids only
cms.find('posts', { populate: { author: { avatar: true }, tags: true } })
cms.find('pages', { populate: { seo: { image: true } } }) // through a group
cms.find('authors', { populate: { posts: true } })        // join
```

- `populate: true` (default) resolves every relation up to `depth` hops. Group keys do not count as hops.
- A `populate` object resolves only the listed paths: `true` is one hop, a nested object goes further. `depth` is ignored then. `true` on a group key resolves every relation in the group one hop.
- A `join` resolves only when named in a `populate` object, else it is absent. It returns all matching documents, newest first, with their own relations as ids unless nested paths say otherwise.
- A missing target resolves to `null`, and is dropped from a `many` array. Cycles end at the depth limit.
- Result types follow the options, and invalid `populate` keys are type errors.
- One query per relation or join field per hop.

`defineCms({ populate: { depth: 2, maxDepth: 5 } })` sets the defaults: `depth` for `populate: true` (default 2), `maxDepth` for HTTP requests (default 5; the local API has no limit).

Over HTTP: `?populate=false`, `?populate=author.avatar,tags`, `?depth=3`. The client turns a `populate` object into these paths. Unknown paths, fields that cannot populate and more hops than `maxDepth` return 400.

When a document is deleted, every relation that points to it applies its `onDelete` rule, all in one transaction:

- `set-null` (default): a single relation becomes `null`, a `many` array drops the id.
- `restrict` (default for `required`): the delete throws `ConflictError` (exported from `integral-cms`) and changes nothing. HTTP returns 409 with `references`, each `{ collection, id }` or `{ global }`.
- `cascade`: the referencing documents are deleted too, recursively, with their own rules.

Known limits:

- Restrict is checked per document as the cascade reaches it. A `restrict` reference from a document that a later cascade step would delete still blocks the whole delete.
- Joins and delete checks scan the source collection with `json_extract` / `json_each`. That is fine up to roughly 10k–50k documents per collection. Indexes can come later without API changes.

### Astro

```ts
// astro.config.ts: needs an SSR adapter, e.g. @astrojs/node
import integralCms from 'integral-cms/astro'

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [integralCms()], // reads ./integral.config.ts, options: { entry, admin }
})
```

The integration adds a middleware that exposes the instance as `Astro.locals.integral`, fully typed.

```astro
---
export const prerender = false
const posts = await Astro.locals.integral.find('posts')
---
```

Pages with `prerender = false` read live content. Prerendered pages read content at build time.
Secrets go through `astro:env`; see `examples/astro/integral.config.ts`.

### Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['integral-cms/nuxt'], // reads ./integral.config.ts, options: integralCms: { entry, admin }
  runtimeConfig: { cmsSecret: '', databaseUrl: `file:${resolve('cms.db')}` },
})
```

`integral.config.ts` can call `useRuntimeConfig()` for the secret and database URL.

The module auto-imports `useIntegral()`. It has the read methods of the client (`find`, `findOne`, `findById`, `getGlobal`) but returns `useAsyncData` results.
During SSR it calls the CMS in-process; on client-side navigation it fetches the public read API.

```vue
<script setup lang="ts">
const { data: posts } = await useIntegral().find('posts')
const { data: post } = await useIntegral().findOne('posts', { where: { slug: 'hello' } })
</script>
```

Server routes can import the instance as the default export of `#integral/config` (an alias for `integral.config.ts`) for writes or custom queries.

### TanStack Start

No module needed. A splat server route hands API requests to the CMS. `integralAdmin()` builds the admin, and a server route serves its page:

```ts
// src/routes/api/cms/$.ts
const handle = ({ request }: { request: Request }) => cms.fetch(request)

export const Route = createFileRoute('/api/cms/$')({
  server: { handlers: { GET: handle, POST: handle, PUT: handle, DELETE: handle } },
})
```

```ts
// vite.config.ts
import { integralAdmin } from 'integral-cms/vite'

export default defineConfig({ plugins: [tanstackStart(), nitro(), viteReact(), integralAdmin()] })
```

```ts
// src/routes/admin.$.ts
import html from '#integral/admin-html'

export const Route = createFileRoute('/admin/$')({
  server: { handlers: { GET: () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } },
})
```

```tsx
// src/routes/index.tsx: loaders run on client and server, so read content in a server function
import cms from '../../integral.config'

const getPosts = createServerFn().handler(() => cms.find('posts'))

export const Route = createFileRoute('/')({ loader: () => getPosts(), component: Home })
```

`integralAdmin()` also keeps `integral-cms` external in the SSR build, because bundling it breaks libsql's native binding.

### Any other framework

Send `/api/cms/*` to `cms.fetch(request)`. With Vite, use `integralAdmin()` as in TanStack Start and return `#integral/admin-html` for `/admin` and `/admin/*`. Otherwise serve a page of its own with an empty element and mount into it:

```ts
import { mountAdmin } from 'integral-cms/admin'

mountAdmin('#admin')
```

## Auth

`auth` is [better-auth](https://better-auth.com)'s options object. It is better-auth's API and follows better-auth's versioning.

- Core owns `database`, `basePath` and `secret`. It always turns `emailAndPassword` on, because the admin login needs it; your other email options stay.
- `modelName` is not accepted: core reads the `user` table by name, so auth tables keep their default names.
- Only the first user can sign up without a session. After that, any user creation without a signed-in session returns 403, on every endpoint (email sign-up, social sign-in, magic link, other plugins). A signed-in admin can create more users, for example with the `admin()` plugin. Server code that calls better-auth without a request is trusted.
- Tables of plugins are created at runtime on the first database access. There is no CLI step.
- Core's first-user rule runs before your `databaseHooks.user.create.before`.
- The admin login supports email and password only. Plugins that need UI (2FA, passkey, magic link) work on the server, but not in the admin yet.

Coming from Payload, the auth hooks map to better-auth's request hooks:

| Payload | better-auth |
| --- | --- |
| `beforeLogin` | `hooks.before` with `ctx.path === '/sign-in/email'` |
| `afterLogin` | `hooks.after` with `ctx.path === '/sign-in/email'` |
| `afterLogout` | `hooks.after` with `ctx.path === '/sign-out'` |
| `afterForgotPassword` | `hooks.after` with `ctx.path === '/request-password-reset'` |

```ts
import { createAuthMiddleware } from 'better-auth/api'

auth: {
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-in/email') console.log('signed in')
    }),
  },
}
```

## Customize the admin

Create `integral.admin.ts` next to `integral.config.ts`. Astro, Nuxt and `integralAdmin()` pick it up at startup; delete it to go back to the default. Restart the dev server after adding or removing it.

```ts
// integral.admin.ts
import { defineAdmin } from 'integral-cms/admin'

export default defineAdmin({
  fields: { color: mountColorInput },
  pages: {
    home: { route: '/', mount: mountHome },
    stats: { label: 'Stats', mount: mountStats },
  },
})
```

- `fields` registers an input per custom field type. A field with `type: 'custom:color'` uses `fields.color`. Custom types are stored and validated as strings, and fall back to a text input without a registered one. Only built-in types and `custom:` types type-check, so a typo like `'txt'` is an error.
- `pages` adds routes under the admin path. The path is `/<key>` unless `route` is set; routes start with `/`, and nesting and params work, like `route: '/reports/:id'`. Pages with a `label` are linked in the sidebar.
- A page on a built-in path replaces that view: `route: '/'` replaces the start page, `route: '/collections/posts'` the posts list. Without one, the admin keeps its default.

Every slot is one function, `mount(el, ctx)`, so any framework can plug in. It gets an empty element and the context, and returns a cleanup. Return `{ update, unmount }` instead to also receive context changes. For Vue and React there are ready-made wrappers:

```ts
import { renderVue } from 'integral-cms/admin/vue'
import { renderReact } from 'integral-cms/admin/react'

fields: { color: renderVue(ColorInput) }      // a .vue component, gets the context as reactive props
fields: { color: renderReact(ColorInput) }    // a React component, re-rendered on context changes
```

They import your `vue` or `react-dom`, so the components run in your app's runtime with HMR. Other frameworks, or no framework, write the function directly:

```ts
// Plain DOM
color(el, { value, onChange }) {
  const input = Object.assign(document.createElement('input'), { type: 'color', value })
  input.oninput = () => onChange(input.value)
  el.append(input)
  return () => input.remove()
}

// Svelte 5
color: (el, ctx) => {
  const app = mount(ColorInput, { target: el, props: ctx })
  return () => unmount(app)
}
```

The admin bundles its own Vue, so hosts install nothing extra and no runtime is shared with it.

Contexts: fields get `{ name, field, value, onChange }`. Pages get `{ params, query }`: the route params and the query string. Both also get `integral`: `base` is the admin path to prefix links with, and `navigate(path)` opens an admin view without a reload. Plain links under `base` also open in the admin. For content, use `createClient()` from `integral-cms/client`; the admin's session cookie makes writes work. Navigating between two URLs of the same page, say `/reports/posts/1` to `/reports/posts/2?tab=body`, calls `update` with the new context instead of remounting. `renderVue` and `renderReact` turn that into prop changes, so watch `params` or put it in an effect's dependencies to refetch. All three examples have a `post` page that does this. The admin wraps a field in its label; the input only renders the control, in the admin's light DOM, so the shared `.input` and `.btn` classes apply.

To serve the admin elsewhere, pass a path: `admin: '/cms'` to the Astro integration or the Nuxt module, or `integralAdmin({ path: '/cms' })` with a matching route file (`src/routes/cms.$.ts`). To ship no admin at all, pass `admin: false`. Core never imports the admin, so it only lands in your bundle when you mount it.

## Environment and deployment

- `dev` and `preview` load `.env` in all examples. The examples' `start` scripts pass `--env-file-if-exists=.env` to Node.
- In production, set variables in your host or process manager.
- **Use an absolute database path or a `libsql://` URL in production.** A relative `file:` path resolves against the working directory. For example, `nuxt preview` runs from `.output/`, which every build deletes.
- Build on the same OS and CPU you deploy to. libsql ships a native binary per platform.

## Project layout

```
packages/core    integral-cms: schema, Hono app, local API, HTTP client, auth, Astro integration, Nuxt module, Vite plugin
packages/admin   Vue 3 + Tailwind admin, built as a library into core's dist/admin (private)
examples/astro   Astro 7 app, mixing prerendered pages and SSR pages, on @astrojs/node
examples/nuxt    Nuxt 4 app
examples/tanstack-start  TanStack Start (React) app on Nitro v3
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev:astro` / `dev:nuxt` / `dev:tanstack` | Build packages, start the example and the admin playground on `:5173/admin/` |
| `pnpm --filter @integral-cms/admin watch` | Rebuild the admin into the example on change |
| `pnpm build` | Build packages and all examples |
| `pnpm typecheck` | Build packages, then type-check everything |

## Status

Working:

- Schema-in-code collections and globals with inferred types
- Relations between collections: `relation` and `join` fields, typed `populate`, `onDelete` rules
- Admin: list, create, edit, delete; globals; email/password login; custom fields and pages via `integral.admin.ts` (`mount(el, ctx)` from any framework)
- Public read API with equality filters and `limit`; `Astro.locals.integral` in Astro, `useIntegral()` in Nuxt
- Validation at the API (zod), CSRF protection, first-user-only sign-up
- Astro integration, Nuxt module, TanStack Start via `integralAdmin()`; dev, preview and production on Node
- SQLite via libsql (local file or Turso), Kysely
- better-auth options pass through (`auth`): plugins, hooks, sessions

Roadmap, roughly in order:

1. Live preview: `preview: (doc) => url` per collection, iframe in the editor, draft cookie
2. Drafts and published versions
3. Media uploads with a storage adapter (local disk, S3/R2)
4. Rich text (format still open: Tiptap JSON or Markdown)
5. Invites, roles and access control
6. Plugin hooks (`beforeChange`, `afterChange`)
7. Cloudflare Workers: D1 driver, per-request bindings
8. Postgres
9. SvelteKit adapter
10. Publish to npm

## Prior art

- [Pruvious](https://pruvious.com): the Nuxt-integrated CMS this idea comes from
- [Payload 3](https://payloadcms.com): schema in code, embedded in Next.js, Drizzle adapters
- [SonicJS](https://sonicjs.com): Hono + D1 + Drizzle, one JSON documents table
- [Keystatic](https://keystatic.com): clean Astro integration, files in git
- [Sveltia CMS](https://github.com/sveltia/sveltia-cms): git-based; its field widgets are worth a look
