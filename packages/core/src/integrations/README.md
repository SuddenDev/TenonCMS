# integrations

Framework integrations: `integral-cms/astro`, `integral-cms/nuxt` and `integral-cms/vite`. They generate no code. Each one points `#integral/config` at the host's `integral.config.ts`, mounts `/api/cms` (`cms.fetch`, see `src/http/`), serves the admin page (`src/admin/`) and starts the preview runtime (`src/preview/`). `integral-cms/vite` only serves the admin; the host mounts the API itself.

## Follow the setup

The Astro integration and the Nuxt module set up a host through:

alias `#integral/config` → API route → `admin/` (path, alias, favicon, entry, page) → preview runtime → injected types

The aliases point the runtime files at the host's config and `integral.admin.ts`. The API route passes every `/api/cms` request to `cms.fetch`. `adminPath()` validates the admin path; the admin page loads `src/admin/entry.ts`, a second client entry in the host's Vite build. The preview runtime gets the admin path (or `false`) for the admin bar's links: Astro writes it into the injected script, Nuxt into `runtimeConfig.public.integral.admin`. Last, the types fill the client's `Register`, and on Astro `App.Locals`.

## Files

| Path                             | Responsibility                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `admin/types.ts`                 | `AdminOption` and `AdapterOptions`. `integral-cms/nuxt` exports the latter as `Options`.                 |
| `admin/path.ts`                  | `adminPath()`: validates the `admin` option.                                                             |
| `admin/build.ts`                 | `adminInput()` and `adminChunk`: the admin's client input. `adminAlias()`: the `#integral/admin` target. |
| `admin/favicon.ts`               | `findFavicon()` and `faviconDefine()`: the host favicon as a Vite define.                                |
| `admin/html.ts`                  | `adminHtml()`: the standalone admin page.                                                                |
| `astro/index.ts`                 | `integralCms()`: routes, aliases, middleware, preview script and injected types.                         |
| `astro/route.ts`                 | The `/api/cms` route.                                                                                    |
| `astro/middleware.ts`            | Sets `Astro.locals.integral` to the instance of the request's user.                                      |
| `astro/admin.astro`              | The admin page.                                                                                          |
| `nuxt/index.ts`                  | The module: aliases, handlers, admin entry and page, preview plugin, types and libsql tracing.           |
| `nuxt/runtime/composables.ts`    | `useIntegral()`: the client's read methods in `useAsyncData`, with preview drafts merged in.             |
| `nuxt/runtime/plugin.client.ts`  | Starts the preview runtime.                                                                              |
| `nuxt/runtime/server/handler.ts` | The `/api/cms` handler.                                                                                  |
| `nuxt/runtime/server/admin.ts`   | Serves the admin page from `#integral/admin-html`.                                                       |
| `vite/index.ts`                  | `integralAdmin()`: the admin entry and `#integral/admin-html` for frameworks without an adapter.         |

Files the host compiles (`route.ts`, `middleware.ts`, `admin.astro`, `nuxt/runtime/`) ship as `.ts` source in `dist/`. Server runtime files MUST import from `h3`, not `#imports`. The admin path MUST NOT be `/` or sit under `API_BASE`. Builds keep core external in SSR, because bundling it breaks libsql's native binding; Nitro 2 also needs the libsql binaries in `traceInclude`.
