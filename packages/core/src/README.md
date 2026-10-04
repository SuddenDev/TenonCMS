# integral-cms core

The source of the `integral-cms` package. Each folder is one area and has its own README.

| Path            | What it is                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------- |
| `index.ts`      | The public barrel. Everything a host imports from `integral-cms` is listed here.             |
| `errors.ts`     | `ValidationError` (400) and `ConflictError` (409). No imports, so the browser can use it.    |
| `cms/`          | `defineCms()`: the instance and its local API (`find`, `create`, …). Start here.             |
| `collections/`  | Collection configuration and typed definition helpers.                                       |
| `globals/`      | Global configuration and typed definition helpers.                                           |
| `auth/`         | better-auth configuration and provider creation.                                             |
| `schema/`       | How content is described: collections, fields, hooks, the types built from them, validation. |
| `content/`      | Shared lifecycle, read/write pipelines, population and content integrity.                    |
| `db/`           | Content queries and migrations. One JSON documents table for all collections.                |
| `http/`         | The `/api/cms` HTTP API (Hono), a thin layer over the local API.                             |
| `client/`       | `createClient()`, the typed HTTP client for the browser.                                     |
| `media/`        | The media library: uploads, storage adapters (`local`, `s3`), image providers, media routes. |
| `plugins/`      | The plugin contract and the bundled plugins.                                                 |
| `presets/`      | Ready-made fields, hooks and settings globals (`general`, `seo`) a host spreads or gets.     |
| `helpers/`      | Small render helpers without imports (`slugify`, `seoMeta`, `breadcrumbs`).                  |
| `preview/`      | Live preview: `preview` URLs, and the browser runtime that patches pages with unsaved edits. |
| `admin/`        | Glue to serve the admin UI on its own page. The UI itself is `packages/admin`.               |
| `integrations/` | Framework integrations: Astro, Nuxt, plain Vite.                                             |
| `tests/`        | Integration tests against a real in-memory instance.                                         |

## How a request flows

```
browser ── client/ ──▶ http/ ──▶ cms/ (local API) ──▶ collections/globals ──▶ content/ ──▶ db/
server code ─────────────────────▲
```

Server code calls the local API directly. HTTP only adds sessions, `private` fields and query parsing.
