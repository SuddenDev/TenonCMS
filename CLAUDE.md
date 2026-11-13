# tenoncms

An embeddable CMS for Vite-based frameworks. It runs inside the host app (same repo, same deploy), with no separate service. Status: proof of concept. Vision, usage and roadmap: [README.md](README.md).

Packages:

- `packages/core` publishes as `tenoncms`, with the `tenon` bin in `src/cli/` (backup, restore, upgrade, login)
- `packages/plugins` (private): the bundled plugins
- `packages/admin` (private): the Vue admin
- `packages/create-tenoncms` publishes as `create-tenoncms`: the scaffolder. Its starters live in `templates/`
- `examples/{astro,astro-pglite,nuxt,tanstack-start,standalone,cloudflare}`

## Where to look

Read the doc for an area before you change it. Update it in the same change.

| Area                                                   | Read                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| What a host sees (features and options)                | [docs/guide/](docs/guide/README.md)                                                                                   |
| Developer docs index                                   | [docs/dev/](docs/dev/README.md)                                                                                       |
| Architecture, `defineCms()`, module map                | [docs/dev/core.md](docs/dev/core.md)                                                                                  |
| Field types, type inference, validation                | [docs/dev/schema.md](docs/dev/schema.md)                                                                              |
| Reads, writes, population, integrity                   | [docs/dev/content.md](docs/dev/content.md)                                                                            |
| Media                                                  | [docs/dev/media.md](docs/dev/media.md)                                                                                |
| Client, HTTP, auth, users, database                    | [docs/dev/server.md](docs/dev/server.md)                                                                              |
| Plugins                                                | [docs/dev/plugins.md](docs/dev/plugins.md)                                                                            |
| Live preview, admin bar                                | [docs/dev/preview.md](docs/dev/preview.md)                                                                            |
| Admin (core contract and Vue app)                      | [docs/dev/admin.md](docs/dev/admin.md)                                                                                |
| Astro, Nuxt, Vite, Cloudflare adapters                 | [docs/dev/integrations.md](docs/dev/integrations.md)                                                                  |
| Examples                                               | [docs/dev/examples.md](docs/dev/examples.md)                                                                          |
| Why it is built this way                               | [docs/dev/design-decisions.md](docs/dev/design-decisions.md)                                                          |
| Known traps (check when something behaves strangely)   | [docs/dev/gotchas.md](docs/dev/gotchas.md)                                                                            |
| The `tenon` CLI and `create-tenoncms`                  | [docs/guide/cli.md](docs/guide/cli.md), `packages/core/src/cli/README.md`, [templates/README.md](templates/README.md) |
| Curl smoke tests for adapters, media, locales, invites | [docs/dev/smoke-tests.md](docs/dev/smoke-tests.md)                                                                    |
| Code style and naming                                  | [code-rules.md](code-rules.md), [GLOSSARY.md](GLOSSARY.md)                                                            |
| One module in detail (also rich text, email, access)   | `packages/core/src/<module>/README.md`                                                                                |

## Commands

- `pnpm dev:astro` / `dev:astro-pglite` / `dev:nuxt` / `dev:tanstack` / `dev:standalone`: build packages, then run the example (ports 4321 / 4322 / 3000 / 3100 / 3200), the core watcher and the admin playground.
  - Core changes reload in the example without a restart.
  - The playground has HMR on `localhost:5173/admin/` and proxies `/_tenon` to the example (`CMS_URL`).
  - The example's `/admin` uses the admin built at startup. `pnpm --filter @tenoncms/admin watch` rebuilds it on change (full reload).
- `pnpm build:packages`: required after any change in `packages/*`, because examples consume `dist/`. Never run it while a dev watcher runs: the core build deletes `dist/`.
- `pnpm build`: packages and all examples.
- `pnpm typecheck`: runs `build:packages`, then typechecks all workspaces. Run it before calling work done. While a dev watcher runs, use `pnpm -r typecheck`.
- `pnpm test`: the fast pass. Vitest in `packages/core` (project `node`: unit tests and the integration suite on libsql), `packages/plugins`, plus a few pure helpers in `packages/admin`. No build needed, tests import `src/`.
  - `pnpm test:full`: also runs the integration suite on PGlite and `node:sqlite`, and the workerd tests. Run it before calling work done that touches SQL, migrations or the database adapters.
  - Watch: `pnpm --filter tenoncms test:watch`.
  - One test: `npx vitest run --project node <file> -t '<name>'` in `packages/core`. `pnpm ... test -- -t` does not filter.
- `pnpm tarball`, then `pnpm smoke:templates <framework> <target> [database] [storage] [template]`: scaffolds a starter against the packed `tenoncms`, installs, builds and runs `tenon backup --dry-run`. CI runs the jobs of `scripts/template-matrix.mjs`.
- `pnpm release`: bumps every version with bumpp, commits, tags and pushes; the tag publishes to npm. See [docs/dev/releasing.md](docs/dev/releasing.md).
- `pnpm lint` (oxlint) / `pnpm fmt` (oxfmt): the husky pre-commit hook runs lint-staged (`oxlint --fix`, then `oxfmt`). `pnpm install` enables it via `prepare`.
  - oxfmt cannot format `.astro`, so those files use Prettier with `prettier-plugin-astro` (`.prettierrc.json`).
  - In `*.test.ts`, unused vars and expressions are allowed, because the type tests rely on them.
- Migrations are code in `packages/core/src/db/migrations/cms.ts` (SQLite) and `postgres.ts`. Add a new key to both; never edit one that has shipped.

## Testing

- TDD, RED then GREEN: write a failing test first and run it to see it fail for the right reason. Then write the least code that makes it pass. A bug fix starts with a test that reproduces it.
- Unit tests sit next to the code as `*.test.ts`, named after the file they test. They cover pure functions.
- `packages/core/src/tests/*.test.ts` is the integration suite, one file per area (`access`, `drafts`, `media`, `richtext` and so on; list the folder). Add HTTP behavior there.
  - Each test builds a real `defineCms()` on `:memory:` libsql and drives it through `createClient()`. The Vitest projects `pglite` and `sqlite` run the suite again on PGlite and `node:sqlite`. Use `testDatabase()` / `testDb()` from `setup.ts`, never a literal `libsql(":memory:")`.
  - `setup.ts` has the shared schema and helpers: `fresh()`, `relational()`, `seed()`, `localized()` / `seeded()`, `withMedia()`. `fixtures.ts` has tiny images.
- `*.workerd.test.ts` runs in workerd (Vitest project `workerd`), inside the Worker of `src/tests/workerd/`. `tsc` skips these files, because the Workers types clash with the DOM and Node types.
- Examples and adapters have no tests yet. Verify them with the [smoke tests](docs/dev/smoke-tests.md).

## Rules that apply everywhere

- Validation and access rules live in the local API. HTTP is a thin layer over it.
  - Content writes run behind CSRF and `optionalSession`. Every other write route MUST stay behind `session`.
  - Read routes are public. They MUST only accept field names that exist in the schema.
- Hooks and nested calls MUST use the `cms` they receive. Inside a transaction, use `trx`. `:memory:` libsql has one connection, so anything else blocks.
- Options the admin evaluates (conditions, built-in checks, plain defaults) MUST be JSON.
- `schema/condition.ts`, `errors.ts` and `helpers/*` MUST have no imports. Browser code runs them. Browser code MUST use type-only imports of schema types, so zod stays on the server.
- Admin UI:
  - Plain Vue SFCs with `<script setup>`.
  - Theme tokens (`bg-card`, `text-muted-foreground`), never fixed colors.
  - shadcn components from `shared/components/ui/` for every input and button.
  - Icons through `Icon.vue`. Never import `@lucide/vue` statically.
  - Import across folders with the `@/` alias.

## Code style

The short version. Reasons and the rest: [code-rules.md](code-rules.md).

- Search for the owner before you add a helper. Never write a second version of validation, traversal, locale resolution or hook order.
- Name a function so it makes sense without its import path: `writeDocument`, not `write`. `is…` and `can…` return a boolean. A function that throws starts with `require…`.
- Write a coordinating function as the real sequence: early returns first, then one phase per blank-line block (resolve context, check access, load, prepare, persist, effects).
- Keep core files as lean as possible with code readabilty being of most importance.
- Add JSDoc only for what the signature cannot say: ordering, mutation, what `undefined` means, which transaction. Do not repeat the name.

```ts
// Good: states a rule the signature cannot show.
/**
 * Finds an unexpired upload owned by the scope's user.
 * @returns The upload row, or `undefined` for an unknown, expired or foreign upload.
 */

// Bad: repeats the name.
/** Gets an upload. */
```

## Conventions

- TypeScript strict.
- One main responsibility per implementation file, usually one or two exported functions. Do not split a coherent pipeline just to meet a line limit.
- Kebab-case file names with a role suffix: `create.endpoint.ts`, `create.operation.ts`, `create.local.ts`, `find-documents.query.ts`.
- Keep entry barrels declarative, except framework-owned conventions.
- Keep module READMEs and the four navigation examples in `packages/core/src/README.md` current.
- Versions: Astro 7, Nuxt 4.6 (nitropack 2, h3 v1), TanStack Start 1.169 (nitro 3 beta, React 19), Vite 8, TypeScript 6, better-auth 1.7, kysely 0.29, Hono 4, zod 4.
- Never mention Claude in commits.

## Next up

- The product roadmap is in [README.md](README.md#status).
- Deferred: switching Drafts and Published without a reload, field loaders that depend on unsaved form values, loader caching or polling, and a save/publish notification API. Add them when a concrete consumer exists.
