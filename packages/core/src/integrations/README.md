# integrations

Framework integrations:

- `integral-cms/astro`
- `integral-cms/nuxt`
- `integral-cms/vite`

Each integration points `#integral/config` at the host's `integral.config.ts`, mounts `/api/cms` (`cms.fetch`, see `src/http/`), serves the admin page (`src/admin/`) and starts the preview runtime (`src/preview/`).
`integral-cms/vite` only serves the admin; the host mounts the API itself. (see the tanstack start example)

## Follow the setup

The Astro integration and the Nuxt module set up a host through:

alias `#integral/config` → API route → `admin/` (path, references, favicon, entry, page) → preview runtime → injected types

The alias points the runtime files at the host's config. The API route passes every `/api/cms` request to `cms.fetch`. `adminPath()` validates the admin path; the admin page loads `src/admin/entry.ts`, a second client entry in the host's Vite build. The preview runtime gets the admin path (or `false`) for the admin bar's links: Astro writes it into the injected script, Nuxt into `runtimeConfig.public.integral.admin`. Last, the types fill the client's `Register`, and on Astro `App.Locals`.

## The client registry

The config runs on the server, but some of what it describes runs in the browser: a custom field, an admin page, an admin bar button. The host points to that browser code with `clientRef("./src/admin/color.ts#mountColor")`. A `clientRef()` is only a string. It does not load anything.

The client registry is the list that turns those strings into code. It is a virtual module, `#integral/client-registry`, that the integration generates at build time. It maps every string to a lazy `import()` of the file and export behind it:

```ts
{ "./src/admin/color.ts#mountColor": () => import("/abs/path/src/admin/color.ts").then(m => m.mountColor) }
```

The admin page (`admin/entry.ts`) and the admin bar import this module, and the server sends only the `clientRef()` strings. When the browser needs `mountColor`, it looks the string up here. The host's own Vite build compiles and bundles each module as usual, so hot reload works and nothing is installed in the admin. The code of a module only loads when something uses it.

Because the server config MUST NOT run in the browser build, the integration cannot ask the config for its references. It reads the config's source and finds the `clientRef()` calls itself. That is why a `clientRef()` MUST be a literal string. A new `clientRef()` needs a dev server restart.

### How the list is built

`clientReferences()` serves `#integral/client-registry`. Its `load` hook flows through:

`client-references.ts` → `collect-client-refs.ts` → `module-syntax.ts` → `scan-refs.ts` → `resolve-import.ts` → `check-site-styles.ts`

The host writes `clientRef("./path.ts#export")` in its server configuration. The browser needs the module behind it, so the plugin finds each call from source and never runs the configuration. `collectClientRefs()` starts at `integral.config.ts` and visits every module it imports. `parseModule()` and `describeModule()` read one file: its imports, exports, re-exports and declarations. `scanModule()` finds the `clientRef()` calls of that file. `resolveImport()` skips Node built-ins and the package's own entries, then asks Vite to resolve the rest. Last, the plugin resolves each specifier to a file and writes one lazy `import()` per reference.

A reference is a _site_ reference when `adminBar` reaches it. The admin bar runs on the host's own pages, so its modules MUST NOT import styles. The crawl therefore scans two ways:

- The first scan of a file covers the whole file and follows all its imports. Everything below an `adminBar` property, and every local declaration it uses, counts as site.
- When `adminBar` uses an import, that module gets a second scan of just that export (`scanExport()`). It follows only what the export uses, through re-exports and `export *` too. Every `clientRef()` found there is a site reference.

`checkSiteStyles()` then walks the module graph of every site reference and rejects eager CSS and Vue `<style>` blocks. CSS imported with `?inline` or `?raw` is fine, because the bar mounts it inside its shadow root.

## Files

| Path                                       | Responsibility                                                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin/types.ts`                           | `AdminOption` and `AdapterOptions`. `integral-cms/nuxt` exports the latter as `Options`.                                                                 |
| `admin/path.ts`                            | `adminPath()`: validates the `admin` option.                                                                                                             |
| `admin/client-refs/client-references.ts`   | `clientReferences()`: the Vite plugin that serves `#integral/client-registry`.                                                                           |
| `admin/client-refs/collect-client-refs.ts` | `collectClientRefs()`: walks the static import graph of `integral.config.ts` and resolves every `clientRef()` specifier to a file.                       |
| `admin/client-refs/scan-refs.ts`           | `scanModule()` and `scanExport()`: find the `clientRef()` calls of one module and mark the ones `adminBar` reaches.                                      |
| `admin/client-refs/module-syntax.ts`       | `parseModule()` and `describeModule()`: parse a script or Vue file and read its imports, exports and declarations.                                       |
| `admin/client-refs/resolve-import.ts`      | `resolveImport()`: skips Node built-ins and the package's own entries.                                                                                   |
| `admin/client-refs/check-site-styles.ts`   | `checkSiteStyles()`: rejects CSS and Vue `<style>` blocks in the admin bar's graph.                                                                      |
| `admin/client-refs/types.ts`               | `Resolver`, `ClientRef`, `Binding` and the AST aliases.                                                                                                  |
| `admin/client-refs/test-project.ts`        | Test helper: a temporary project and a relative-import resolver.                                                                                         |
| `admin/build.ts`                           | `adminInput()` and `adminChunk`: the admin's client input.                                                                                               |
| `admin/favicon.ts`                         | `findFavicon()` and `faviconDefine()`: the host favicon as a Vite define.                                                                                |
| `admin/html.ts`                            | `adminHtml()`: the standalone admin page.                                                                                                                |
| `astro/index.ts`                           | `integralCms()`: routes, aliases, middleware, preview script and injected types.                                                                         |
| `astro/route.ts`                           | The `/api/cms` route.                                                                                                                                    |
| `astro/middleware.ts`                      | Sets `Astro.locals.integral` to the instance of the request's user, and `locals.locale` and `locals.path` (the path without the locale prefix).          |
| `astro/admin.astro`                        | The admin page.                                                                                                                                          |
| `nuxt/index.ts`                            | The module: aliases, handlers, admin entry and page, preview plugin, types and libsql tracing.                                                           |
| `nuxt/runtime/composables.ts`              | `useIntegral()`: the client's read methods in `useAsyncData`, in the route's locale, with preview drafts merged in. `useLocale()` and `useAlternates()`. |
| `nuxt/runtime/plugin.client.ts`            | Starts the preview runtime.                                                                                                                              |
| `nuxt/runtime/server/handler.ts`           | The `/api/cms` handler.                                                                                                                                  |
| `nuxt/runtime/server/admin.ts`             | Serves the admin page from `#integral/admin-html`.                                                                                                       |
| `vite/index.ts`                            | `integralAdmin()`: the admin entry and `#integral/admin-html` for frameworks without an adapter.                                                         |

Files the host compiles (`route.ts`, `middleware.ts`, `admin.astro`, `nuxt/runtime/`) ship as `.ts` source in `dist/`. Server runtime files MUST import from `h3`, not `#imports`. The admin path MUST NOT be `/` or sit under `API_BASE`. Builds keep core external in SSR, because bundling it breaks libsql's native binding; Nitro 2 also needs the libsql binaries in `traceInclude`.

Nuxt reads accept reactive options and document IDs. Their `useAsyncData` keys follow the options and route, so reused pages update on navigation. `useAlternates()` shares the page's published translation URLs with `useLocale().switchLocalePath()` and `switchLocale()`; a missing translation leads to the target locale's homepage. Render the header after the page's read resolves, and compute head metadata from the reactive document.
