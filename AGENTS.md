# tenoncms

A CMS that runs inside the host app: same repo, same deploy, no second service. Built for Vite-based frameworks. Version 0.x. Product overview and roadmap: [README.md](README.md).

## Repository

- `packages/core` publishes as `tenoncms`, with the `tenon` CLI in `src/cli/`. Start at [packages/core/src/README.md](packages/core/src/README.md). Each module has its own README.
- `packages/admin` (private): the Vue admin, built into core.
- `packages/plugins` (private): the bundled plugins.
- `packages/create-tenoncms` publishes as `create-tenoncms`. Its starters live in `templates/` ([templates/README.md](templates/README.md)).
- `examples/`: astro, astro-pglite, cloudflare, headless-site, nuxt, standalone, tanstack-start, vercel.
- `docs/`: the docs site (tenoncms.com). Pages live in `docs/content/docs/`.
- `dev/`: knowledge the code cannot show.

| When you need                         | Read                                               |
| ------------------------------------- | -------------------------------------------------- |
| How a module works                    | `packages/core/src/<module>/README.md`             |
| What users see (features and options) | `docs/content/docs/`                               |
| Why it is built this way              | [dev/design-decisions.md](dev/design-decisions.md) |
| Help when something behaves strangely | [dev/gotchas.md](dev/gotchas.md)                   |
| To verify an adapter or example       | [dev/smoke-tests.md](dev/smoke-tests.md)           |
| To release                            | [dev/releasing.md](dev/releasing.md)               |
| The domain words                      | [GLOSSARY.md](GLOSSARY.md)                         |

## Commands

- `pnpm dev:astro` / `dev:astro-pglite` / `dev:vercel` / `dev:nuxt` / `dev:tanstack` / `dev:standalone`: build the packages, then run the example (ports 4321 / 4322 / 4323 / 3000 / 3100 / 3200), the core watcher and the admin playground.
  - Core changes reload in the example. The playground has HMR on `localhost:5173/admin/`.
  - The example's `/admin` uses the admin built at startup. `pnpm --filter @tenoncms/admin watch` rebuilds it.
  - Each example needs a `.env` with `TENON_SECRET` (Nuxt: `NUXT_TENON_SECRET`), 32 or more characters. Copy `.env.example`.
- `pnpm dev:docs`: the docs site.
- `pnpm build:packages`: required after a change in `packages/*`, because examples use `dist/`. Never run it while a dev watcher runs: it deletes `dist/`.
- `pnpm typecheck`: builds the packages, then typechecks everything. While a watcher runs, use `pnpm -r typecheck`.
- `pnpm test`: unit tests and the integration suite on libsql. No build needed.
  - `pnpm test:full`: also PGlite, `node:sqlite` and workerd.
  - One test: `npx vitest run --project node <file> -t '<name>'` in `packages/core`. `pnpm ... test -- -t` does not filter.
- `pnpm lint` (oxlint) and `pnpm fmt` (oxfmt, Prettier for `.astro`). The pre-commit hook runs both on staged files.
- `pnpm tarball`, then `pnpm smoke:templates <framework> <target> [database] [storage] [template]`: scaffolds a starter against the packed `tenoncms` and builds it.
- `pnpm release`: see [dev/releasing.md](dev/releasing.md).

## How to contribute

1. Read the module README and the docs page of the area first.
2. Write a failing test. Run it and see it fail for the right reason. A bug fix starts with a test that reproduces it.
3. Write the least code that makes it pass. Fix the root cause in the function all callers share.
4. Update the module README and the page in `docs/content/docs/` in the same change.
5. Run `pnpm typecheck` and `pnpm test`. Also run `pnpm test:full` for SQL, migrations or database adapters, and the [smoke tests](dev/smoke-tests.md) for adapters and examples, which have no automated tests.
6. Commit with [conventional commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`). The release notes come from them. Mark a breaking change with `feat!:` or a `BREAKING CHANGE:` footer. Never mention Claude or other AI tools in commits.

A reviewer MUST be able to find where the behavior lives, follow the call without opening every helper, see its effects and how it fails, and find the test that protects it.

## Tests

- Unit tests sit next to the code as `<file>.test.ts` and cover pure functions.
- `packages/core/src/tests/*.test.ts` is the integration suite, one file per area. Add HTTP and multi-module behavior there.
  - Each test builds a real `defineCms()` and drives it through `createClient()`. Use `testDatabase()` / `testDb()` from `setup.ts`, never a literal `libsql(":memory:")`, so the `pglite` and `sqlite` projects can run the suite again.
  - `setup.ts` has `fresh()`, `relational()`, `seed()`, `localized()` / `seeded()` and `withMedia()`. `fixtures.ts` has tiny images.
- `*.workerd.test.ts` runs in workerd. `tsc` skips these files.
- Name a test for the behavior and the condition. Assert returned data, stored state and errors. Do not assert key order, `JSON.stringify` output or the exact shape of incidental details.
- Cover empty, invalid, unauthorized and rollback cases. Type tests MUST also prove rejection.

## Rules

- Validation, access rules and hooks live in the local API. HTTP is a thin layer. Correctness MUST NOT depend on entering through HTTP.
  - Content writes run behind CSRF and `optionalSession`. Every other write route MUST stay behind `session`.
  - Read routes are public. They MUST only accept field names that exist in the schema.
- Hooks and nested calls MUST use the `cms` they receive, and `trx` inside a transaction. Single-connection databases (`:memory:` libsql, PGlite, a Durable Object) block otherwise.
- Take untrusted data as `unknown` and validate it. Do not cast. Query parsers build objects without a prototype. User values are always parameterized.
- Options the admin evaluates (conditions, built-in checks, plain defaults) MUST be JSON.
- `schema/condition.ts`, `errors.ts` and `helpers/*` MUST have no imports, because browser code runs them. Browser code MUST import schema types type-only, so zod stays on the server.
- Migrations are code in `packages/core/src/db/migrations/cms.ts` (SQLite) and `postgres.ts`. Add a new key to both. Never edit one that has shipped.
- Keep public import paths. Do not rename a public export for style.
- Admin UI: plain Vue SFCs with `<script setup>`, theme tokens (`bg-card`, `text-muted-foreground`) instead of fixed colors, shadcn components from `shared/components/ui/` for every input and button, icons through `Icon.vue` (never a static `@lucide/vue` import), and the `@/` alias across folders.

## Code style

- **Put behavior with its owner.** An endpoint translates HTTP, an operation enforces rules, shared content stages do the write, a query does persistence: `endpoint -> scoped local API -> operation -> content stages -> queries`. Search for the owner before you add a helper. Never write a second version of validation, traversal, locale resolution or hook order.
- **Split by responsibility, not by line count.** One main responsibility per file, usually one or two exports, with its private helpers nearby. Extract a file for a distinct concept, independent callers, a testable contract or a browser/server boundary. No `services`, `managers` or `helpers` folders for imagined growth.
- **Files** are kebab-case with a role suffix: `create.endpoint.ts`, `create.operation.ts`, `create.local.ts`, `find-documents.query.ts`. Internal code imports the owning file, not the package root. Barrels only list exports.
- **Names** make sense without the import path: `writeDocument`, not `write`. `is…` and `can…` return a boolean. A function that throws starts with `require…`, `check…` or `validate…`. Use the domain words from [GLOSSARY.md](GLOSSARY.md).
- **A coordinating function reads as the real sequence.** Early returns first, then one phase per blank-line block: resolve context, check access, load, prepare, persist, run effects. Main function at the top. No nested ternaries. Name an intermediate value instead.
- **Types:** TypeScript strict. Explicit return types at module boundaries. Keep complex inference in type modules with positive and negative type tests. After a change to read types, check both `pnpm typecheck` and the declaration build.
- **Comments:** JSDoc only for what the signature cannot say: ordering, mutation, what `undefined` means, which transaction. Comments go above the code, in short sentences, with RFC 2119 keywords for obligations. No end-of-line comments, commented-out code or change history.
- **Formatting:** oxfmt, and Prettier for `.astro`. Format only the files you change.
- Keep the module READMEs and the four request traces in [packages/core/src/README.md](packages/core/src/README.md) current.

```ts
// Good: states a rule the signature cannot show.
/**
 * Finds an unexpired upload owned by the scope's user.
 * @returns The upload row, or `undefined` for an unknown, expired or foreign upload.
 */

// Bad: repeats the name.
/** Gets an upload. */
```

Versions: Astro 7, Nuxt 4.6 (nitropack 2, h3 v1), TanStack Start 1.169 (nitro 3 beta, React 19), Vite 8, TypeScript 6, better-auth 1.7, kysely 0.29, Hono 4, zod 4.

## Deferred

Add these when a concrete consumer exists: switching Drafts and Published without a reload, field loaders that depend on unsaved form values, loader caching or polling, and a save/publish notification API.
