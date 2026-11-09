# integrations

`client-modules.ts` owns the environment boundary. Its server loader emits one reference per runtime export of a `.client` entry, using root-relative module IDs; published plugin builds map those IDs to public package exports. Its browser resolver rejects server-only dependencies. `client-module.ts` reads export names without executing modules. `collectClientRefs()` stops at `.client` boundaries and registers their exports, retaining admin-bar reachability for the CSS check. The existing registry and lazy mount lifecycle handle both typed imports and explicit references.
Framework adapters, frontend components and preview helpers live here, grouped by framework. Shared rich-text rendering and preview runtime logic stay in their feature modules. Admin mounting helpers stay in `admin/vue/` and `admin/react/`.

Framework integrations:

- `tenoncms/astro`
- `tenoncms/nuxt`
- `tenoncms/vite`

Databases. Each returns `{ dialect }` and imports its driver, an optional peer dependency:

- `tenoncms/libsql`: `libsql(urlOrConfig)` over `@libsql/client` with `libsqlDialect()` (`src/db/adapters/`). The client opens on the first query.
- `tenoncms/sqlite`: `sqlite(path)` over Node's built-in `node:sqlite` with `nodeSqliteDialect()` (`src/db/adapters/`). Nothing to install. The database opens on the first query.
- `tenoncms/postgres`: `postgres(urlOrPoolConfig)` builds the `database` over a `pg` pool that reads `bigint` as a number.
- `tenoncms/pglite`: `pglite(client)` builds the `database` over a PGlite instance with `pgliteDialect()` (`src/db/adapters/`).

Runtime adapter:

- `tenoncms/cloudflare`: runs the CMS inside a SQLite-backed Durable Object. `durableObject()` is the config's `database`. `tenonObject(cms)` returns the object class. `createObjectClient(request, stub)` is the HTTP client for code outside the object. The Astro integration switches to it with `@astrojs/cloudflare`. Each object gets its own copy of the instance through `withDatabase()` (`src/cms/`), bound to its storage by `durableObjectDialect()` (`src/db/adapters/`). The config's own instance keeps its schema and `localization`, but every database call throws.

Each integration points `#tenon/config` at the host's `tenon.config.ts`, mounts `/_tenon` (`cms.fetch`, see `src/http/`), serves the admin page (`src/admin/`) and starts the preview runtime (`src/preview/`). Astro and Nuxt also mount `/sitemap.xml` and `/robots.txt` on the same handler, except a path that `siteRoutes()` finds served by the host (see `src/seo/`).
`tenoncms/vite` only serves the admin; the host mounts the API itself. (see the tanstack start example)

## Frontend helpers

- `tenoncms/vue`: `vue/index.ts`, the Vue components `Image`, `Picture`, `Link`, `Blocks` (with `useBlockEdit()`) and `Richtext`. They take `as` and `asChild` through `vue/primitive.ts`. Nuxt registers them as `TenonImage`, `TenonPicture`, `TenonLink` (`nuxt/runtime/components/link.ts`, with `NuxtLink` as `as`), `TenonBlocks` and `TenonRichtext`.
- `tenoncms/react`: `react/index.ts`, the same components for React, with `as` and `asChild` through `react/primitive.ts`, plus `Seo` (`react/seo.ts`, tags that React 19 hoists into `<head>`). Block components get `edit` as a prop.
- `tenoncms/astro/components`: `astro/components/`, the same components as `.astro` files, without `asChild`, plus `Seo`, which reads the settings globals from `Astro.locals.tenon` when they are not passed. `Link` renders a plain `<a>`.
- `tenoncms/components`: `components.ts`, the shared helpers `imageAttrs()`, `pictureAttrs()`, `linkAttrs()` and `editBlock()`. The `Seo` components and `useTenonSeo()` share `seoHead()` from `helpers/`.
- `tenoncms/richtext/vue`, `tenoncms/richtext/react` and `tenoncms/richtext/astro`: `Richtext` alone. Vue also covers Nuxt.
- `tenoncms/preview/vue` and `tenoncms/preview/react`: `vue/preview.ts` and `react/preview.ts`, exporting `useDraft()`.

These public imports remain independent of the source layout. The TypeScript helpers are tsdown entries; the Astro components are copied into `dist/integrations/astro/components/` for the host to compile. See [rich text](../richtext/README.md) and [preview](../preview/README.md) for usage.

## Follow the setup

The Astro integration and the Nuxt module set up a host through:

alias `#tenon/config` → API route → `admin/` (path, references, favicon, entry, page) → preview runtime → injected types

The alias points the runtime files at the host's config. The API route passes every `/_tenon` request to `cms.fetch`. `adminPath()` validates the admin path; the admin page loads `src/admin/entry.ts`, a second client entry in the host's Vite build. The preview runtime gets the admin path (or `false`) for the admin bar's links: Astro writes it into the injected script, Nuxt into `runtimeConfig.public.tenon.admin`. Last, the types fill the client's `Register`, and on Astro `App.Locals`.

## The client registry

The config runs on the server, but some of what it describes runs in the browser: a custom field, an admin page, an admin bar button. The host points to that browser code with `clientRef("./src/admin/color.ts#mountColor")`. A `clientRef()` is only a string. It does not load anything.

The client registry is the list that turns those strings into code. It is a virtual module, `#tenon/client-registry`, that the integration generates at build time. It maps every string to a lazy `import()` of the file and export behind it:

```ts
{ "./src/admin/color.ts#mountColor": () => import("/abs/path/src/admin/color.ts").then(m => m.mountColor) }
```

The admin page (`admin/entry.ts`) and the admin bar import this module, and the server sends only the `clientRef()` strings. When the browser needs `mountColor`, it looks the string up here. The host's own Vite build compiles and bundles each module as usual, so hot reload works and nothing is installed in the admin. The code of a module only loads when something uses it.

Because the server config MUST NOT run in the browser build, the integration cannot ask the config for its references. It reads the config's source and finds the `clientRef()` calls itself. That is why a `clientRef()` MUST be a literal string. A new `clientRef()` needs a dev server restart.

### How the list is built

`clientReferences()` serves `#tenon/client-registry`. Its `load` hook flows through:

`client-references.ts` → `collect-client-refs.ts` → `module-syntax.ts` → `scan-refs.ts` → `resolve-import.ts` → `check-site-styles.ts`

The host writes `clientRef("./path.ts#export")` in its server configuration. The browser needs the module behind it, so the plugin finds each call from source and never runs the configuration. `collectClientRefs()` starts at `tenon.config.ts` and visits every module it imports. `parseModule()` and `describeModule()` read one file: its imports, exports, re-exports and declarations. `scanModule()` finds the `clientRef()` calls of that file. `resolveImport()` skips Node built-ins and the package's own entries, then asks Vite to resolve the rest. Last, the plugin resolves each specifier to a file and writes one lazy `import()` per reference.

A reference is a _site_ reference when `adminBar` reaches it. The admin bar runs on the host's own pages, so its modules MUST NOT import styles. The crawl therefore scans two ways:

- The first scan of a file covers the whole file and follows all its imports. Everything below an `adminBar` property, and every local declaration it uses, counts as site.
- When `adminBar` uses an import, that module gets a second scan of just that export (`scanExport()`). It follows only what the export uses, through re-exports and `export *` too. Every `clientRef()` found there is a site reference.

`checkSiteStyles()` then walks the module graph of every site reference and rejects eager CSS and Vue `<style>` blocks. CSS imported with `?inline` or `?raw` is fine, because the bar mounts it inside its shadow root.

## Files

| Path                                       | Responsibility                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin/types.ts`                           | `AdminOption` and `AdapterOptions`. `tenoncms/nuxt` exports the latter as `Options`.                                                                                   |
| `admin/path.ts`                            | `adminPath()`: validates the `admin` option.                                                                                                                           |
| `admin/client-refs/client-references.ts`   | `clientReferences()`: the Vite plugin that serves `#tenon/client-registry`.                                                                                            |
| `admin/client-refs/collect-client-refs.ts` | `collectClientRefs()`: walks the static import graph of `tenon.config.ts` and resolves every `clientRef()` specifier to a file.                                        |
| `admin/client-refs/scan-refs.ts`           | `scanModule()` and `scanExport()`: find the `clientRef()` calls of one module and mark the ones `adminBar` reaches.                                                    |
| `admin/client-refs/module-syntax.ts`       | `parseModule()` and `describeModule()`: parse a script or Vue file and read its imports, exports and declarations.                                                     |
| `admin/client-refs/resolve-import.ts`      | `resolveImport()`: skips Node built-ins and the package's own entries.                                                                                                 |
| `admin/client-refs/check-site-styles.ts`   | `checkSiteStyles()`: rejects CSS and Vue `<style>` blocks in the admin bar's graph.                                                                                    |
| `admin/client-refs/types.ts`               | `Resolver`, `ClientRef`, `Binding` and the AST aliases.                                                                                                                |
| `admin/client-refs/test-project.ts`        | Test helper: a temporary project and a relative-import resolver.                                                                                                       |
| `admin/build.ts`                           | `adminInput()` and `adminChunk`: the admin's client input.                                                                                                             |
| `admin/favicon.ts`                         | `findFavicon()` and `faviconDefine()`: the host favicon as a Vite define.                                                                                              |
| `admin/html.ts`                            | `adminHtml()`: the standalone admin page, with `noindex`.                                                                                                              |
| `admin/seo-routes.ts`                      | `siteRoutes()`: `/sitemap.xml` and `/robots.txt`, minus those turned off or served by a host file in `public/` or a route folder.                                      |
| `astro/index.ts`                           | `tenonCms()`: routes, aliases, middleware, preview script and injected types.                                                                                          |
| `astro/route.ts`                           | The `/_tenon` route.                                                                                                                                                   |
| `astro/middleware.ts`                      | Sets `Astro.locals.tenon` to the instance of the request's user, and `locals.locale` and `locals.path` (the path without the locale prefix).                           |
| `astro/admin.astro`                        | The admin page.                                                                                                                                                        |
| `astro/cloudflare/route.ts`                | With `@astrojs/cloudflare`: passes `/_tenon` to the CMS object.                                                                                                        |
| `astro/cloudflare/middleware.ts`           | With `@astrojs/cloudflare`: sets `Astro.locals.tenon` to the client over the CMS object, and `locale` and `path`.                                                      |
| `cloudflare/index.ts`                      | `durableObject()` and `tenonObject()`: the CMS inside a Durable Object.                                                                                                |
| `libsql/index.ts`                          | `libsql()`: the `database` on a SQLite file, `:memory:` or Turso.                                                                                                      |
| `sqlite/index.ts`                          | `sqlite()`: the `database` on `node:sqlite`, a SQLite file or `:memory:`.                                                                                              |
| `postgres/index.ts`                        | `postgres()`: the `database` on a Postgres server.                                                                                                                     |
| `pglite/index.ts`                          | `pglite()`: the `database` on PGlite.                                                                                                                                  |
| `cloudflare/object-client.ts`              | `createObjectClient()`: the client over the object's stub, with the request's origin and cookie.                                                                       |
| `nuxt/index.ts`                            | The module: aliases, handlers, admin entry and page, preview plugin, types and libsql tracing.                                                                         |
| `nuxt/runtime/composables.ts`              | `useTenon()`: the client's read methods in `useAsyncData`, in the route's locale, with preview drafts merged in. `useLocale()`, `useAlternates()` and `useTenonSeo()`. |
| `nuxt/runtime/components/link.ts`          | `TenonLink`: `Link` with `NuxtLink` as `as`.                                                                                                                           |
| `components.ts`                            | `tenoncms/components`: `imageAttrs()`, `pictureAttrs()`, `linkAttrs()` and `editBlock()`, shared by the components.                                                    |
| `vue/index.ts`                             | `tenoncms/vue`: `Image`, `Picture`, `Link`, `Blocks`, `useBlockEdit()` and `Richtext`.                                                                                 |
| `vue/image.ts`                             | `Image`: a populated `image` field as `<img>`.                                                                                                                         |
| `react/index.ts`                           | `tenoncms/react`: `Image`, `Picture`, `Link`, `Blocks`, `Richtext` and `Seo`, with `react/primitive.ts` for `as` and `asChild`.                                        |
| `astro/components/`                        | `tenoncms/astro/components`: the same, and `Seo`, as `.astro` files.                                                                                                   |
| `vue/primitive.ts`                         | `primitiveProps` and `renderPrimitive()`: `as` and `asChild`.                                                                                                          |
| `vue/link.ts`                              | `Link`: a populated `link` field. A component `as` gets internal paths as `to`.                                                                                        |
| `vue/blocks.ts`                            | `Blocks` and `useBlockEdit()`: a component per `blockType`, and `data-cms` values by block index.                                                                      |
| `nuxt/runtime/plugin.client.ts`            | Starts the preview runtime.                                                                                                                                            |
| `nuxt/runtime/server/handler.ts`           | The `/_tenon` handler.                                                                                                                                                 |
| `nuxt/runtime/server/admin.ts`             | Serves the admin page from `#tenon/admin-html`.                                                                                                                        |
| `vite/index.ts`                            | `tenonAdmin()`: the admin entry and `#tenon/admin-html` for frameworks without an adapter.                                                                             |

Files the host compiles (`route.ts`, `middleware.ts`, `astro/cloudflare/`, `admin.astro`, `nuxt/runtime/`) ship as `.ts` source in `dist/`. Server runtime files MUST import from `h3`, not `#imports`. The admin path MUST NOT be `/` or sit under `API_BASE`. Builds keep core external in SSR, because bundling it breaks libsql's native binding; Nitro 2 also needs the libsql binaries in `traceInclude`.

Nuxt reads accept reactive options and document IDs. Their `useAsyncData` keys follow the options and route, so reused pages update on navigation. `useAlternates()` shares the page's published translation URLs with `useLocale().switchLocalePath()` and `switchLocale()`; a missing translation leads to the target locale's homepage. Render the header after the page's read resolves, and compute head metadata from the reactive document.
