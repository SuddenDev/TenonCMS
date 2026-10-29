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

cp examples/standalone/.env.example examples/standalone/.env   # set CMS_SECRET (32+ chars)
pnpm dev:standalone                                   # http://localhost:3200/admin
```

Generate a secret with `openssl rand -hex 32`.

On first visit, choose "Create the admin account". Only the first user can sign up. Admins invite everyone else under **Users**.

## A first example

Define a collection:

```ts
// collections/posts.ts
import { defineCollection } from "integral-cms";

export const posts = defineCollection({
  titleField: "title",
  fields: {
    title: { type: "text", required: true },
    slug: { type: "slug", from: "title", unique: true },
    publishedAt: { type: "date" },
    body: { type: "textarea" },
  },
});
```

Create the instance in `integral.config.ts` at the project root:

```ts
import { defineCms } from "integral-cms";
import { libsql } from "integral-cms/libsql";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts },
  database: libsql("file:/absolute/path/cms.db"), // or libsql://… (Turso) with { url, authToken }
  secret: process.env.CMS_SECRET!, // at least 32 characters
});
```

Read it from server code. Everything is typed from the schema:

```ts
await cms.find("posts", { where: { slug: "hello" }, limit: 1 });
```

Then wire your framework: [Framework setup](docs/guide/frameworks.md).

## Guides

**Get started**

| Guide                                       | What it covers                               |
| ------------------------------------------- | -------------------------------------------- |
| [Framework setup](docs/guide/frameworks.md) | Astro, Nuxt, TanStack Start, any Vite host   |
| [Schema and fields](docs/guide/schema.md)   | Field types, options, validation, conditions |

**Model your content**

| Guide                                              | What it covers                                 |
| -------------------------------------------------- | ---------------------------------------------- |
| [Relations](docs/guide/relations.md)               | `relation`, `join`, `populate`, `onDelete`     |
| [Lists and blocks](docs/guide/lists-and-blocks.md) | `array` and `blocks` fields                    |
| [Rich text](docs/guide/richtext.md)                | `richtext` fields, links, rendering components |
| [Media](docs/guide/media.md)                       | Uploads, storage, responsive images            |

**Work with content**

| Guide                                        | What it covers                                          |
| -------------------------------------------- | ------------------------------------------------------- |
| [Reading and writing](docs/guide/reading.md) | `find`, filters, `select`, `update`, the browser client |
| [Hooks](docs/guide/hooks.md)                 | Stages, order, errors, transactions                     |
| [Drafts](docs/guide/drafts.md)               | Draft, publish and discard                              |
| [Localization](docs/guide/localization.md)   | Locales, fallback, `hreflang`, site strings             |

**Build the site**

| Guide                                        | What it covers                                                 |
| -------------------------------------------- | -------------------------------------------------------------- |
| [Pages and SEO](docs/guide/pages-and-seo.md) | Nested page paths, `seoMeta()`, `breadcrumbs()`, site settings |
| [Live preview](docs/guide/live-preview.md)   | `permalink`, `edit()`, the visual editor, the admin bar        |

**Run it**

| Guide                                                   | What it covers                                    |
| ------------------------------------------------------- | ------------------------------------------------- |
| [Auth, users and access](docs/guide/auth-and-access.md) | better-auth options, roles, invites, access rules |
| [Email](docs/guide/email.md)                            | SMTP and custom adapters, templates               |
| [Customize the admin](docs/guide/admin.md)              | Branding, custom fields and pages                 |
| [Plugins](docs/guide/plugins.md)                        | Using, writing and publishing plugins             |

## Environment and deployment

- `dev` and `preview` load `.env` in all examples. The examples' `start` scripts pass `--env-file-if-exists=.env` to Node.
- In production, set variables in your host or process manager.
- **Use an absolute database path or a `libsql://` URL in production.** A relative `file:` path resolves against the working directory. For example, `nuxt preview` runs from `.output/`, which every build deletes.
- Build on the same OS and CPU you deploy to. libsql ships a native binary per platform.

## Project layout

```
packages/core            integral-cms: schema, Hono app, local API, client, auth, presets, adapters
packages/plugins         bundled plugins (private)
packages/admin           Vue 3 + Tailwind admin, built into core's dist/admin (private)
examples/astro           Astro 7 on @astrojs/node
examples/nuxt            Nuxt 4
examples/tanstack-start  TanStack Start (React) on Nitro v3
examples/standalone      Headless: API and admin on Vite + Nitro v3
```

## Contributing

Commands, rules and architecture notes are in [CLAUDE.md](CLAUDE.md) and `docs/dev/`. Code style: [code-rules.md](code-rules.md).

| Command                                                           | What it does                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev:astro` / `dev:nuxt` / `dev:tanstack` / `dev:standalone` | Build packages, start the example and the admin playground on `:5173/admin/` |
| `pnpm --filter @integral-cms/admin watch`                         | Rebuild the admin into the example on change                                 |
| `pnpm build`                                                      | Build packages and all examples                                              |
| `pnpm test`                                                       | Run the unit and integration tests                                           |
| `pnpm typecheck`                                                  | Build packages, then type-check everything                                   |

## Status

Working:

- Schema-in-code collections and globals with inferred types, relations, lists and blocks
- Hooks, validation, conditions, drafts and publishing, per-locale content
- Page and SEO preset, live preview and an admin bar on the site
- Rich text: Tiptap JSON with internal links and images, and Astro, Vue and React renderers
- Media library: uploads to disk or S3/R2, responsive images
- Admin in English and German, with custom fields, pages and bar items
- Users with roles, invites and access rules; better-auth options pass through
- Plugins (`redirects`, and `example` to copy from), SMTP email
- Astro, Nuxt and TanStack Start; SQLite via libsql (file or Turso), Postgres, PGlite

Roadmap, roughly in order:

1. ~~Live preview~~ Done, see [Live preview](docs/guide/live-preview.md)
2. ~~Drafts and published versions~~ Done, see [Drafts](docs/guide/drafts.md)
3. ~~Media uploads with a storage adapter (local disk, S3/R2)~~ Done, see [Media](docs/guide/media.md)
4. ~~Rich text~~ Done, see [Rich text](docs/guide/richtext.md) (Tiptap JSON)
5. ~~Invites and roles, access control~~ Done, see [Auth, users and access](docs/guide/auth-and-access.md)
6. Cloudflare Workers: D1 driver, per-request bindings
7. ~~Postgres~~ Done, see [Schema](docs/guide/schema.md) (also PGlite)
8. SvelteKit adapter
9. Publish to npm

Build later, small and in no order: a document type export, e.g. `DocOf<typeof cms, 'posts'>`, so a post as a read needs no `Awaited<ReturnType<…>>`.

## Inspirations and Credits

- [Pruvious](https://pruvious.com): the Nuxt-integrated CMS this idea comes from
- [Payload 3](https://payloadcms.com): schema in code, embedded in Next.js, Drizzle adapters
- [SonicJS](https://sonicjs.com): Hono + D1 + Drizzle, one JSON documents table
- [Keystatic](https://keystatic.com): clean Astro integration, files in git
- [Sveltia CMS](https://github.com/sveltia/sveltia-cms): git-based; its field widgets are worth a look
