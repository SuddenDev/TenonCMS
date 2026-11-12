# Tenon CMS

Making your headless cms setup monolithic again. A CMS that lives **inside** your Vite-based app; built on web standards and a stack you already use.

> Currently in version 0.X, soon in beta. A real documentation page will follow, but is currently not availble yet.

## Why

Headless CMSs work with any framework because they talk REST or GraphQL. The price is a second service with its own deployment and database server.

Tenon takes the other route for any framework built on Vite and compatible with Hono.

## Features

- **Part of your app.** The admin and the API are routes in your app.
- **Schema in code.** Collections and globals are TypeScript, and their types flow into your pages.
- **Local API.** Server code calls `cms.find("posts")` directly, without HTTP.
- **Your database.** SQLite or Turso, Postgres, PGlite, or a Durable Object on Cloudflare.
- **Your admin.** A Vue app your Vite bundles. Add fields, pages or styles, or leave it out and go headless.
- **Web standards.** The core is a [Hono](https://hono.dev) app: `Request` in, `Response` out.
- **Supported Starter Frameworks.** Astro, Nuxt 4, Tanstack Start, (+ more to come)
- **Deploy where you want.** Node, Cloudflare Durable Objects, Vercel
- **Localization.** Supports localization out of the box (content and admin)
- **Batteries included.** SMTP Interface already configured, image transformations, draft + publishing, jobs & queues, plugin system, presets for marketing pages, framework integrations, data export / import and more.

## Create a project

Needs Node 24 or newer.

```sh
npm create tenoncms@latest
```

Follow the wizard, select your preffered framework, database, media storage and starter template (currently only minimal available).

```sh
cd my-site
npm run dev
```

Open `/admin` and create the first admin account. Only the first user can sign up; admins invite everyone else under **Users**.

See for more information [The CLI](docs/guide/cli.md).

To add Tenon to an existing app instead, see [Your first site](docs/guide/first-site.md) and [Framework setup](docs/guide/frameworks.md).

## A first collection

```ts
// cms/collections/posts.ts
import { defineCollection } from "tenoncms";

export const posts = defineCollection({
  titleField: "title",
  fields: {
    title: { type: "text", required: true },
    slug: { type: "slug", from: "title", unique: true },
    body: { type: "richtext" },
  },
});
```

Read it from server code, typed from the schema:

```ts
const [post] = await cms.find("posts", { where: { slug: "hello" }, limit: 1 });
```

## Guides

All guides are listed in [docs/guide](docs/guide/README.md). A few to start with:

| Guide                                            | What it covers                                |
| ------------------------------------------------ | --------------------------------------------- |
| [Schema and fields](docs/guide/schema.md)        | Field types, options, validation, conditions  |
| [Reading and writing](docs/guide/reading.md)     | `find`, filters, `select`, the browser client |
| [Media](docs/guide/media.md)                     | Uploads, storage, responsive images           |
| [Live preview](docs/guide/live-preview.md)       | The visual editor and the admin bar           |
| [Auth and access](docs/guide/auth-and-access.md) | Roles, invites, access rules                  |
| [Backup](docs/guide/backup.md)                   | Export, import, full backups                  |

## Roadmap

| Area                                                                  | Status  |
| --------------------------------------------------------------------- | ------- |
| Collections, globals, relations, lists and blocks, inferred types     | Done    |
| Hooks, validation, conditions, drafts, scheduled publishing, versions | Done    |
| Localization, pages and SEO, sitemap and robots, menus                | Done    |
| Live preview, admin bar, components for Vue, React and Astro          | Done    |
| Rich text (Tiptap), media library with local, S3 and R2 storage       | Done    |
| Users, roles, invites, access rules, API keys, edit locks             | Done    |
| Jobs and cron, webhooks, plugins, SMTP email                          | Done    |
| Postgres and PGlite, Vercel, Cloudflare (Durable Objects)             | Done    |
| Backup and restore, seeding, `create-tenoncms`, the `tenon` CLI       | Done    |
| Docs, then the first npm release                                      | Next    |
| Cloudflare for Nuxt, TanStack Start and standalone                    | Next    |
| Search in the admin, later full-text search                           | Planned |
| Redirects created on path changes                                     | Planned |
| Caching of public reads, purged on publish                            | Planned |
| The admin on phones                                                   | Planned |
| Rich text extensions from the config, Vercel image provider           | Planned |
| OpenAPI spec                                                          | Planned |
| SvelteKit, multiplayer and presence, trash, content migrations, SDKs  | Later   |

## Disclaimer

This project was rapidly developed using AI tools. That being said: That does not mean, that I did not look at the code or do not understand it. That also does not mean, that I do not care about the code quality or the user and developer experience. If you have any concerns concerns regarding security, code quality or similar, plase feel free to contact me or create issues.

## Contributing

Issues and pull requests are welcome. For a bigger change, open an issue first.

```sh
pnpm install
pnpm dev:astro      # or dev:nuxt, dev:tanstack, dev:standalone
```

Each example needs a `.env` with a secret of 32 or more characters (`CMS_SECRET`, in Nuxt `NUXT_CMS_SECRET`): copy its `.env.example` and set one with `openssl rand -hex 32`. The example runs on its own port (Astro: `http://localhost:4321/admin`), and the admin playground with hot reload on `http://localhost:5173/admin/`.

| Command                              | What it does                                                    |
| ------------------------------------ | --------------------------------------------------------------- |
| `pnpm test`                          | Unit and integration tests                                      |
| `pnpm test:full`                     | Also the integration tests on PGlite, `node:sqlite` and workerd |
| `pnpm typecheck`                     | Builds the packages, then type-checks everything                |
| `pnpm lint` / `pnpm fmt`             | oxlint and oxfmt; the pre-commit hook runs both                 |
| `pnpm smoke:templates <fw> <target>` | Scaffolds and builds a starter (run `pnpm tarball` first)       |

Before a pull request:

- Write a failing test first, then the fix or feature.
- Run `pnpm typecheck` and `pnpm test`, and `pnpm test:full` for database changes.
- Update the docs of the area in the same change.
- Use [conventional commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`. The release notes are generated from them.

Where to read more: [CLAUDE.md](CLAUDE.md) (commands and rules), [docs/dev](docs/dev/README.md) (architecture), [code-rules.md](code-rules.md) (style), [releasing](docs/dev/releasing.md).

```
packages/core             tenoncms: schema, API, admin integration, adapters
packages/admin            the Vue admin, built into core (private)
packages/plugins          bundled plugins (private)
packages/cli              @tenoncms/cli: the tenon command
packages/create-tenoncms  create-tenoncms: the project scaffolder
templates/                the starters of create-tenoncms
examples/                 Astro, Astro + PGlite, Nuxt, TanStack Start, standalone, Vercel, Cloudflare
```

## Credits

- [Pruvious](https://pruvious.com): the Nuxt-integrated CMS this idea comes from
- [Payload 3](https://payloadcms.com): schema in code, embedded in Next.js
- [Sanity](https://sanity.io)

## License

[MIT](LICENSE)
