# Examples

Every example has its instance in `integral.config.ts` at the project root and its collections in `collections/`. Each registers `ExamplePlugin()`: Astro and standalone use the plain DOM renderer, Nuxt Vue and TanStack Start React. All use the pages preset, and the site examples have a catch-all route that reads a page by `path` and renders `seoMeta()`.

| Example                   | What it shows                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/astro`          | The fullest one. Server-rendered pages through `Astro.locals`, localization (`en`, `de`), a kitchen-sink global with every field type, access rules, a custom role, `RedirectsPlugin()`, media, blocks, live preview. |
| `examples/nuxt`           | `useIntegral()` composables, localization with the same setup as Astro, runtime config for secrets, Vue admin renderer.                                                                                               |
| `examples/tanstack-start` | No adapter package: `integralAdmin()`, a server route for the API and one for the admin, server functions in loaders, React admin renderer.                                                                           |
| `examples/standalone`     | Headless: no site. API and admin on Vite and Nitro. Has media with `ipx()` and an `array` field.                                                                                                                      |

## Astro in more detail

- The **kitchen-sink** global holds every field type except `join` (globals cannot hold joins), plus every option and layout feature. Extend it whenever you add a field type or option.
- **Comments** is the access-rule example: visitors can create, readers see only approved ones, only `admin` and `editor` can moderate. The post page lists them and handles its own form post.
- A `strings` global (the `strings()` preset) holds translated site text.
- The post and kitchen-sink pages are server-rendered, so new posts show in dev without a restart.

## Conventions

- Secrets come from the environment (Astro env, `process.env`, or Nuxt runtime config).
- Admin pages that are reachable only by URL use `nav: { display: "none" }`.
- Smoke-test an example with the [smoke tests](smoke-tests.md). Examples and adapters have no automated tests yet.
