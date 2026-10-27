# Developer docs

How integral-cms is built and why. These pages explain ideas and rules. They name few files and functions on purpose, because those change; for code, read the `README.md` in each folder of `packages/core/src/`.

User-facing docs are in [../guide/](../guide/).

**Start here**

1. [Architecture](core.md): packages, how a call flows, the module map
2. [Design decisions](design-decisions.md): why it is built this way

**By area**

| Page                                      | Covers                                             |
| ----------------------------------------- | -------------------------------------------------- |
| [Schema and types](schema.md)             | Validation, the field walker, type inference       |
| [Content engine](content.md)              | Write and read pipelines, population, localization |
| [HTTP, auth and database](server.md)      | Route order, sessions, invites, tables, migrations |
| [Media](media.md)                         | Uploads, storage ordering, image variants          |
| [Plugins](plugins.md)                     | The contract and the bundled plugins               |
| [Live preview and admin bar](preview.md)  | The runtime, URLs, the bar                         |
| [Admin](admin.md)                         | The extension contract and the Vue app             |
| [Framework integrations](integrations.md) | Astro, Nuxt, Vite hosts                            |
| [Examples](examples.md)                   | What each example app demonstrates                 |

**Working on it**

- [Gotchas](gotchas.md): traps that cost time. Check here first when something is odd.
- [Smoke tests](smoke-tests.md): curl checks for adapters, media, locales and invites.
