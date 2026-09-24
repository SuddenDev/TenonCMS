# Kysely and better-auth pass-through

Spec 4 of 6: group field, relation field, hooks, auth, page preset, field options. Execution order: 4, 1, 2, 3, 6, 5. This spec runs first, so specs 2 and 3 (populate, delete scans, transactions) are written against Kysely once.

## Goal

1. Hosts configure better-auth fully: plugins, hooks, session options. Plugin tables are created at runtime, without a CLI step.
2. Core uses one database layer, Kysely, for CMS tables and auth. Drizzle and drizzle-kit leave the project.

## Why Kysely

- better-auth's `getMigrations()` computes and runs missing tables and columns from the actual options, plugins included. It works only with better-auth's built-in Kysely adapter, not with the Drizzle adapter.
- Kysely has dialects for libsql, Cloudflare D1 and Postgres: our three targets.
- Core owns two fixed tables and queries them mostly with raw `json_extract` SQL. Drizzle's typed schema and diffing add little there.
- Kysely does not generate migrations. Core tables change rarely (collections live in JSON), so hand-written migrations are acceptable.

## Database layer (`src/db/`)

- `createDb(url, authToken)` returns a `Kysely<Database>` over core's own small libsql dialect, `libsqlDialect(client)`, built on the existing `@libsql/client`. Nothing connects at import time, as today.
- Core MUST NOT depend on `@libsql/kysely-libsql`. It pulls an older `@libsql/client` and a second native binary, which the Nuxt build does not trace. Switching to the package later is a one-line change (`new LibsqlDialect({ client })`).
- `Database` is a hand-written interface for `cms_documents` and `cms_globals` (about 15 lines). Auth tables are not in it; better-auth owns them.
- Migrations are code, embedded in the bundle: an ordered list of `{ name, up(db) }` run by Kysely's `Migrator` with an inline provider. No filesystem.
- Migration `001` creates the CMS tables with the columns of the CMS part of `drizzle/0000_oval_ricochet.sql`.
- After the CMS migrations, `getMigrations(authOptions).runMigrations()` creates or extends the auth tables. On an existing database it adds only what is missing.
- Migrations still run lazily on first DB access. The existing ceiling stays: no locking between processes. The `ponytail:` note moves with the code.
- Removed: `drizzle-orm`, `drizzle-kit`, `drizzle.config.ts`, `drizzle/`, `db/schema.ts`, `migrations.gen.ts`, `scripts/embed-migrations.mjs`, the `db:generate` script. CLAUDE.md and README MUST be updated to match.

All queries in `index.ts` and `app.ts` move to Kysely. `json_extract` filters use Kysely's `sql` template; field names are still checked against the schema before they reach SQL.

## Transactions

Write operations use `db.transaction().execute(trx => ...)`. The first test of this spec MUST prove an interactive transaction over core's libsql dialect (write, read inside, throw, nothing stored), because spec 3 depends on it.

better-auth runs its own queries on the same Kysely instance. Auth endpoints are not part of CMS write transactions.

## Auth pass-through

```ts
import { admin, twoFactor } from 'better-auth/plugins'

defineCms({
  ...,
  auth: {
    plugins: [admin(), twoFactor()],
    databaseHooks: { user: { create: { after: sendWelcome } } },
    session: { expiresIn: 60 * 60 * 24 * 30 },
  },
})
```

- Type: `BetterAuthOptions` without `database`, `basePath` and `secret`, and without `modelName` in `user`, `session`, `account` and `verification`. Core reads the `user` table by name, so auth tables MUST keep their default names. `cms.auth` is inferred with the host's options, so plugin endpoints are typed.
- Core owns `database` (the shared Kysely instance, `type: 'sqlite'`), `basePath` (`${API_BASE}/auth`) and `secret`.
- `emailAndPassword` is merged with the host's; `enabled: true` is forced, because the admin login needs it.
- The first-user rule is session-based: once a user exists, a request MAY only create a user when it has a signed-in session (e.g. `admin()`'s `createUser` from a signed-in admin). Any user creation from a request without a session returns 403, whatever the endpoint (email sign-up, social sign-in, magic link, other plugins). Server code without a request is trusted, as in better-auth's `admin()` plugin.
- Core's `user.create.before` runs first, then the host's. A host hook MUST NOT be able to reopen public sign-up.
- The docs MUST say that `auth` is better-auth's API and follows its versioning, and map Payload's auth hooks (`afterLogin`, …) to `hooks.after` with `ctx.path`.

## Admin

Unchanged. The admin login supports email and password only. Plugins that need UI (2FA, passkey, magic link) work on the server but not in the admin yet.

Later, out of this spec: built-in admin screens for popular first-party plugins, enabled from plugin ids the server reports; host client plugins exported from `integral.admin.ts`; `Mount` slots for custom login steps.

## Out of scope

- D1 and Postgres dialects (roadmap #8, #9)
- Admin UI for auth plugins
- Locking migrations across processes

## Tests (TDD: write each test, run it RED, then make it GREEN)

- Interactive transaction over core's libsql dialect: a throw inside rolls back a write.
- Fresh `:memory:` database: CMS and auth tables exist after the first access.
- A plugin with its own table (e.g. `twoFactor()`) gets that table at runtime.
- A host `databaseHooks.user.create.after` runs on sign-up.
- A host `user.create.before` runs after core's; a second public sign-up still returns 403.
- A signed-in admin creates a second user through the `admin()` plugin.
- A second user created without a session through another endpoint (e.g. `anonymous()`) returns 403.
- `modelName` in `auth.user` (and the other three models) fails to compile (`@ts-expect-error`).
- A host `hooks.after` sees the sign-in path.
- `emailAndPassword: { enabled: false }` from the host is overridden; sign-in works.
- The whole existing `app.test.ts` suite stays green after the switch.
- The curl smoke test passes on all three examples.
