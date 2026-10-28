# Architecture

How the parts fit together. This page names modules, not files, because file names drift. For code-level detail, open the `README.md` inside each folder of `packages/core/src/`.

## Packages

| Package            | What it is                                                              |
| ------------------ | ----------------------------------------------------------------------- |
| `packages/core`    | Published as `integral-cms`. Schema, local API, HTTP app, adapters.     |
| `packages/admin`   | The Vue admin. Private. Built as a library into core's `dist/admin`.    |
| `packages/plugins` | The bundled plugins (`redirects`, `example`). Private. Built into core. |
| `examples/*`       | One app per supported setup. See [examples](examples.md).               |

## How a call flows

```text
HTTP request  -> route -> scoped local API -> operation -> content engine -> queries -> SQLite
Server code   ---------> scoped local API ---^
```

- HTTP is a thin layer. Validation, access rules, hooks and transactions live in the local API. That is why server code, HTTP and the admin behave the same.
- Every call carries a **scope**: the user, the perspective (published or drafts), the locale, whether access rules apply, the transaction, and a `context` object that all hooks of one operation share.
- Hooks get a `cms` bound to the same scope. Calls made through it join the same transaction. A hook MUST use that `cms`, never the imported instance.
- The server instance skips access rules. HTTP and `cms.withSession()` apply them. The `cms` that hooks get skips them too, but the operation that runs the hook still checks its own caller.

## The instance

- `defineCms()` builds everything inside a closure. There is no global state, so several instances can coexist.
- Config is assembled in a fixed order: merge plugins, add the settings globals, add media, then check the whole schema. Invalid config throws at startup.
- Database and auth are lazy. Nothing connects at import time, and the secret is checked on first auth use, so public pages keep working with a bad config.

## Module map

| Folder in `src/`               | Owns                                                               |
| ------------------------------ | ------------------------------------------------------------------ |
| `cms/`                         | Builds an instance, binds the scoped local API, assembles config   |
| `collections/`, `globals/`     | Config, endpoints and operations for each kind of content          |
| `content/`                     | The shared engine: write and read pipelines, population, integrity |
| `schema/`                      | Field types, validation, hook contracts, type inference, traversal |
| `access/`                      | Access rules and permissions                                       |
| `auth/`, `users/`, `api-keys/` | Sign-in (better-auth), roles, invites, API keys                    |
| `locks/`                       | Edit locks for the admin                                           |
| `http/`                        | The Hono app and its route order                                   |
| `client/`                      | The typed browser client                                           |
| `db/`                          | Tables, migrations, SQL                                            |
| `media/`                       | Uploads, storage, image variants                                   |
| `richtext/`                    | Tiptap documents, links, rendering                                 |
| `email/`                       | Email adapters and templates                                       |
| `preview/`                     | Live preview runtime, preview URLs, the site's admin bar           |
| `plugins/`                     | The plugin contract                                                |
| `presets/`, `helpers/`         | Ready-made fields and hooks; small helpers such as `seoMeta()`     |
| `admin/`                       | The contract between core and the admin app                        |
| `integrations/`                | Astro, Nuxt and Vite adapters                                      |
| `tests/`                       | The integration suite                                              |

Group by feature, not by technical layer. Inside a feature, split into config, endpoints, operations and queries only where each really exists.

## Code that also runs in the browser

Some code ships to the browser: error classes, condition matching, small helpers, the client, the preview runtime and the admin bar. These MUST NOT pull in the server runtime or zod.

- Use type-only imports of schema types in browser code.
- A few files MUST have no imports at all, because the admin bundles them by path. Check the module README before you add an import to a shared helper.

## Public surface

- The root file only re-exports. The public API is what it lists.
- Subpath exports group by purpose: the client, presets, plugins, media providers, framework adapters, admin helpers, preview, rich text and email. `package.json` has the full list.
- Every framework dependency is an optional peer: `astro`, `vite`, `vue`, `react`, `react-dom`, `h3`, `@nuxt/kit`, `@nuxt/schema` and `aws4fetch`. Each is used only by the subpath that needs it.
