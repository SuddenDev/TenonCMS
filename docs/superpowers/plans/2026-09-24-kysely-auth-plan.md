# Plan: Kysely and better-auth pass-through

Spec: `docs/superpowers/specs/2026-09-24-kysely-auth-design.md`. Specs 2 (relation) and 3 (hooks) build on the Kysely layer and its transactions.

All paths are relative to `packages/core` unless noted. Run tests with `pnpm --filter integral-cms test -- <file> -t '<name>'`. No build is needed for tests.

## Verified facts (September 2026)

- `kysely@0.29.6` is already in the tree (better-auth peer, range `^0.28.17 || ^0.29.0`). Core adds it as a direct dependency with the same range.
- better-auth 1.7.5 accepts `database: { db: Kysely<any>, type: 'sqlite' }` and uses it as is (`createKyselyAdapter`, `"db" in database`). Its `transaction` option defaults to `false`, so auth runs no transactions of its own.
- `getMigrations(options)` from `better-auth/db/migration` needs no secret. It introspects, creates missing tables, adds missing columns and indexes. It throws `UnsafeMigrationError` when it would add a required column without a default to a populated table.
- better-auth's default column names are **camelCase** (`emailVerified`, `createdAt`, `userId`) and it stores dates as ISO strings. Databases from the Drizzle version use **snake_case** columns and millisecond dates. No installs exist yet, so there is no upgrade path.
- `databaseHooks.user.create.before(user, ctx)` gets the endpoint context from async local storage, or `null` outside an endpoint. Session-protected endpoints put the session on `ctx.context.session` (`admin()`'s `createUser` reads it with `getAuthoritativeSessionFromCtx`). Server calls like `auth.api.createUser({ body })` get a context without `request` and `headers`.
- `@libsql/client@0.18`: a `:memory:` database has exactly one connection. While a transaction holds it, any other query on the client rejects with `TRANSACTION_ACTIVE` (no hang). File databases use a pool.
- `@libsql/kysely-libsql@0.4.1` (latest) depends on `@libsql/client ^0.8.0` and imports it at module top. That installs and loads a second `@libsql/client` and a second native `libsql` binary next to our 0.18. The Nuxt module's `traceInclude` only covers the binary of our client, so a Nuxt production build would crash on the other one.

## Decisions

- **Own dialect (spec).** Core gets a ~40-line `libsqlDialect(client)` in `src/db/index.ts` over our own `@libsql/client`. Same shape as `@libsql/kysely-libsql` (Kysely's `SqliteAdapter`, `SqliteIntrospector`, `SqliteQueryCompiler`, `client.transaction()` for interactive transactions). Swapping to the package is `new LibsqlDialect({ client })`; the Task 1 test stays the same, but the duplicate client problem above must be solved first.
- **Single-statement writes get no transaction yet.** Today every write is one statement. Spec 3 wraps writes when hooks add statements. Task 1 proves transactions work, which is what spec 3 needs.
- CMS tables keep their snake_case columns and millisecond timestamps. Only the auth tables change.
- Kysely's `Migrator` records runs in `cms_kysely_migration` (and `cms_kysely_migration_lock`), so all core tables share the `cms_` prefix.
- No upgrade path (nothing is public yet): no legacy fixture, no rename migration, no upgrade test.
- The first-user rule counts rows with raw SQL on the `user` table, as today. `AuthOptions` leaves out `modelName`, so the table is always `user`.
- The first-user rule is session-based (Task 9): with a user in the table, a request without `ctx.context.session` gets 403 on any endpoint. Server code without a request is trusted, as in `admin()`.

## Tasks

### Task 1: Spike: interactive transaction over libsql

RED

- `pnpm --filter integral-cms add kysely@"^0.28.17 || ^0.29.0"`.
- New `src/db/index.test.ts`, test `rolls back an interactive transaction`:

```ts
import { createClient } from "@libsql/client";
import { Kysely, sql } from "kysely";
import { libsqlDialect } from "./index.ts";

it("rolls back an interactive transaction", async () => {
  const db = new Kysely<any>({ dialect: libsqlDialect(createClient({ url: ":memory:" })) });
  await sql`CREATE TABLE t (v TEXT)`.execute(db);
  const failed = db.transaction().execute(async (trx) => {
    await trx.insertInto("t").values({ v: "a" }).execute();
    expect(await trx.selectFrom("t").selectAll().execute()).toEqual([{ v: "a" }]);
    throw new Error("boom");
  });
  await expect(failed).rejects.toThrow("boom");
  expect(await db.selectFrom("t").selectAll().execute()).toEqual([]);
});
```

- Run: `pnpm --filter integral-cms test -- src/db/index.test.ts`. Expected failure: `libsqlDialect` is not exported.

GREEN

- In `src/db/index.ts` (next to the Drizzle code for now), add `libsqlDialect(client: Client): Dialect`. The driver's `acquireConnection` returns an object with an optional `tx: Transaction`. `executeQuery` runs `(tx ?? client).execute({ sql, args })` and returns `{ rows, numAffectedRows: BigInt(rowsAffected), insertId: lastInsertRowid }`. `beginTransaction` sets `tx = await client.transaction('write')`, commit and rollback settle it and clear it. `streamQuery` throws. `destroy` closes the client.
- Run the same command. Expect pass.

Commit: `feat(core): add kysely dialect for libsql`

### Task 2: Safety net: fresh database

This test passes on today's Drizzle code. It guards the switch in Tasks 3 and 4.

- In `src/app.test.ts`, add a `tmpDb()` helper: `file:${mkdtempSync(join(tmpdir(), 'integral-'))}/cms.db`, and an `inspect(url)` helper that opens its own `@libsql/client` on that file.
- Test `database › creates CMS and auth tables on first access`: `defineCms` on `tmpDb()`, call `cms.find('posts')` and `cms.auth()`, then assert that `sqlite_master` has `cms_documents`, `cms_globals`, `user`, `session`, `account`, `verification`.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t database`. Expect pass on Drizzle.

Commit: `test(core): cover tables of a fresh database`

### Task 3: Move the CMS tables and the local API to Kysely

Refactor under the green suite. Auth still runs on Drizzle in this task, on its own Drizzle instance over the same `@libsql/client`, so nothing else moves.

RED

- `src/db/index.test.ts`, test `runs CMS migrations once`: `createDb(':memory:')`, `await migrate(db)` twice, then `sqlite_master` has `cms_documents`, `cms_globals`, `cms_documents_collection_idx` and `cms_kysely_migration`.
- Run: `pnpm --filter integral-cms test -- src/db/index.test.ts`. Expected failure: `createDb` returns a Drizzle instance, so `sql\`…\`.execute(db)` or the Kysely table check fails.

GREEN

- `src/db/index.ts`:

```ts
export interface Database {
  cms_documents: {
    id: string;
    collection: string;
    data: string;
    created_at: number;
    updated_at: number;
  };
  cms_globals: { name: string; data: string; created_at: number; updated_at: number };
}

export function createDb(url: string, authToken?: string) {
  return new Kysely<Database>({ dialect: libsqlDialect(createClient({ url, authToken })) });
}

// Keys sort by name. Never edit a migration that has shipped; add a new one.
const migrations: Record<string, Migration> = {
  "001_cms_tables": {
    async up(db) {
      await sql`CREATE TABLE IF NOT EXISTS cms_documents (...)`.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS cms_documents_collection_idx ON cms_documents (collection)`.execute(
        db,
      );
      await sql`CREATE TABLE IF NOT EXISTS cms_globals (...)`.execute(db);
    },
  },
};

// ponytail: no locking between processes; Kysely's migration lock is a no-op on SQLite. Run one instance per database until D1/Postgres.
export async function migrate(db: Kysely<Database>) {
  const { error } = await new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
    migrationTableName: "cms_kysely_migration",
    migrationLockTableName: "cms_kysely_migration_lock",
  }).migrateToLatest();
  if (error) throw error;
}
```

- The column lists come from the CMS part of `drizzle/0000_oval_ricochet.sql`, unchanged. `IF NOT EXISTS` lets the Drizzle glue below create the tables first.
- `src/index.ts`: queries on Kysely. `Row` becomes `Selectable<Database['cms_documents']>`. `toDoc` parses `data` with `JSON.parse` and builds dates with `new Date(row.created_at)`. Writes use `JSON.stringify(data)` and `Date.now()`. Filters stay `sql\`json_extract(data, ${`$.${key}`}) = ${value}\``after the`Object.hasOwn`check. Order:`.orderBy('created_at', 'desc').orderBy(sql\`rowid\`, 'desc')`. `setGlobal`uses`onConflict((oc) => oc.column('name').doUpdateSet({ data, updated_at }))`.
- Auth keeps Drizzle for now, on its own client: in `defineCms`, `db()` opens the old Drizzle instance too, runs the old `cms_migrations` runner **first**, then the Kysely migrator (its `IF NOT EXISTS` makes it a no-op when Drizzle already created the tables). `createAuth` gets the Drizzle instance. On `:memory:` the two clients are two databases, which is fine because auth and CMS tables never join. Keep this glue minimal; Task 4 deletes it.
- Run: `pnpm --filter integral-cms test`. Expect all green, including Task 2.

Commit: `refactor(core): query cms tables with kysely`

### Task 4: Auth on the Kysely adapter, auth tables from `getMigrations`

RED

- `src/auth.ts`: switch to `database: { db, type: 'sqlite' }` and replace the Drizzle count with `sql<{ n: number }>\`SELECT count(*) AS n FROM "user"\``. Delete the Drizzle glue from Task 3, including the old `cms_migrations` runner.
- To build the options before the secret check, split `src/auth.ts` into `authOptions(db, secret)` (plain object) and `createAuth(options) = betterAuth(options)`. `index.ts` passes `authOptions(db, secret)` to `createAuth`.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t database`. Expected failure: `user`, `session`, `account` and `verification` are missing, because nothing creates auth tables any more.

GREEN

- `src/db/index.ts`: `migrate(db, authOptions)` runs the CMS migrator, then `(await getMigrations(authOptions)).runMigrations()`. `index.ts` passes the same `authOptions(db, secret)` to `migrate`.
- Run the test, then the whole suite: `pnpm --filter integral-cms test`. Expect all green.
- Check the test output for better-auth warnings. Warnings are fine; errors are not.

Commit: `feat(core): run auth on kysely and create auth tables at runtime`

### Task 5: Remove Drizzle

No new test; the suite is the check.

- `pnpm --filter integral-cms remove drizzle-orm drizzle-kit`.
- Delete `drizzle.config.ts`, `drizzle/`, `src/db/schema.ts`, `src/db/migrations.gen.ts`, `scripts/` (only `embed-migrations.mjs` lives there).
- `package.json`: remove the `db:generate` script.
- `grep -rn drizzle packages/core/src packages/core/package.json` MUST return nothing.
- Run: `pnpm --filter integral-cms test` and `pnpm typecheck`. Expect green.

Commit: `chore(core): remove drizzle`

### Task 6: `auth` option with plugins

RED

- `src/app.test.ts`, test `auth › creates plugin tables at runtime and types plugin endpoints`:

```ts
import { twoFactor } from "better-auth/plugins";

const url = tmpDb();
const cms = defineCms({ ...base, database: { url }, auth: { plugins: [twoFactor()] } });
const auth = await cms.auth();
expect(typeof auth.api.enableTwoFactor).toBe("function");
expect(await tables(url)).toContain("twoFactor");
() => {
  // @ts-expect-error core reads the `user` table by name
  defineCms({ ...base, auth: { user: { modelName: "users" } } });
  // @ts-expect-error same for the other models
  defineCms({ ...base, auth: { session: { modelName: "sessions", expiresIn: 60 } } });
};
```

- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t plugin`. Expected failure: no `twoFactor` table (and `tsc` reports `auth` as an unknown option).

GREEN

- `src/auth.ts`:

```ts
type Model = "user" | "session" | "account" | "verification";
// Core reads the `user` table by name, so models MUST keep their default names.
// `never` also rejects `modelName` next to valid keys; generic inference skips excess property checks.
export type AuthOptions = Omit<BetterAuthOptions, "database" | "basePath" | "secret" | Model> & {
  [K in Model]?: Omit<NonNullable<BetterAuthOptions[K]>, "modelName"> & { modelName?: never };
};

export function authOptions<A extends AuthOptions>(db: Kysely<Database>, secret: string, host: A) {
  return {
    ...host,
    basePath: `${API_BASE}/auth`,
    secret,
    database: { db, type: "sqlite" as const },
    emailAndPassword: { enabled: true },
    databaseHooks: { user: { create: { before: (_user, ctx) => firstUserOnly(db, ctx) } } },
  };
}
```

- `src/index.ts`: add `const A extends AuthOptions = {}` to `defineCms`, option `auth?: A` (destructure as `auth: authConfig = {} as A`), and pass it to `authOptions`. `Cms<T>` keeps working through the default.
- Run the test, then `pnpm typecheck`. Expect green.

Commit: `feat(core): pass auth options through to better-auth`

### Task 7: `emailAndPassword` stays enabled

RED

- Test `auth › forces email sign-in on and keeps the host's other email options`: `auth: { emailAndPassword: { enabled: false, minPasswordLength: 20 } }`. Expect `client.signUp(admin)` (11-character password) to return 400. Then sign up with a 20-character password, sign out, sign in, and expect a session.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'email sign-in'`. Expected failure: the first sign-up returns 200, because core's `emailAndPassword` from Task 6 replaces the host's and drops `minPasswordLength`.

GREEN

- `emailAndPassword: { ...host.emailAndPassword, enabled: true }`. Add a comment above it: the admin login needs email and password, so core MUST force it.
- Run again. Expect pass.

Commit: `feat(core): merge host email and password options`

### Task 8: Host `databaseHooks` run, core's first-user rule runs first

RED

- Test `auth › runs host database hooks after the first-user rule`:

```ts
const calls: string[] = [];
const cms = defineCms({
  ...base,
  auth: {
    databaseHooks: {
      user: {
        create: {
          before: async () => {
            calls.push("before");
          },
          after: async (user) => {
            calls.push(`after:${user.email}`);
          },
        },
      },
    },
  },
});
await client.signUp(admin);
expect(await status(client.signUp({ ...admin, email: "c@d.co" }))).toBe(403);
expect(calls).toEqual(["before", "after:a@b.co"]);
```

- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'database hooks'`. Expected failure: `calls` is `[]`, because core's `databaseHooks` replaces the host's.

GREEN

- Merge in `authOptions`:

```ts
const create = host.databaseHooks?.user?.create
databaseHooks: {
  ...host.databaseHooks,
  user: {
    ...host.databaseHooks?.user,
    create: {
      ...create,
      // Core MUST run first, so a host hook cannot reopen public sign-up.
      async before(user, ctx) {
        await firstUserOnly(db, ctx)
        return create?.before?.(user, ctx)
      },
    },
  },
},
```

- `firstUserOnly(db, ctx)` throws `APIError('FORBIDDEN')` when `user` has rows. The second sign-up throws before the host hook, so `calls` has one `before`. Task 9 lets requests with a session through.
- Run again. Expect pass.

Commit: `feat(core): run host database hooks after the first-user rule`

### Task 9: The first-user rule is session-based

RED

- Test `auth › lets a signed-in admin create users`:

```ts
import { admin as adminPlugin } from "better-auth/plugins";

// `defaultRole: 'admin'` makes the first user an admin.
const { client, fetch } = setup(
  defineCms({ ...base, auth: { plugins: [adminPlugin({ defaultRole: "admin" })] } }),
);
await client.signUp(admin);
const res = await fetch("/api/cms/auth/admin/create-user", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "c@d.co", password: "password123", name: "C" }),
});
expect(res.status).toBe(200);
expect(await status(client.signUp({ ...admin, email: "e@f.co" }))).toBe(403);
```

- `setup()` takes the instance: `function setup(cms = define('x'.repeat(32)))`. Add the parameter if it is missing.
- Check the endpoint path and body against better-auth 1.7 before writing the test.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'admin create'`. Expected failure: 403, because `firstUserOnly` blocks every create.

GREEN

- `firstUserOnly(db, ctx)`: return early when `ctx.context.session` is set, or when there is no request (`!ctx?.request && !ctx?.headers`: trusted server code). Comment above it: once a user exists, only a request with a session MAY create users, whatever the endpoint.
- Test `auth › rejects user creation without a session on any endpoint`: with `anonymous()`, sign up the first user, then `POST /api/cms/auth/sign-in/anonymous` without a cookie. Expect 403. A path check on `/sign-up/email` lets it through with 200.
- Run again, then `-t 'database hooks'`. Expect pass.

Commit: `feat(core): limit only public sign-up to the first user`, then `fix(core): limit user creation without a session to the first user`

### Task 10: Host `hooks.after` sees the auth path

Expected to pass after Task 6 (the spread passes `hooks` through). It is a regression guard for the docs' Payload mapping. If it fails, fix the spread order.

- Test `auth › runs host request hooks`:

```ts
import { createAuthMiddleware } from "better-auth/api";
const paths: string[] = [];
auth: {
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      paths.push(ctx.path);
    });
  }
}
// sign up, sign out, sign in
expect(paths).toContain("/sign-in/email");
```

- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'request hooks'`.

Commit: `test(core): cover host auth request hooks`

### Task 11: Docs

- `README.md`:
  - Config example: an optional `auth` block (plugins, `databaseHooks`, `session`), as in the spec.
  - New section "Auth": `auth` is better-auth's options object and follows better-auth's versioning. Core owns `database`, `basePath` and `secret`, forces `emailAndPassword.enabled`, and does not accept `modelName`. Once a user exists, only a request with a session can create users, on any endpoint; a signed-in admin can create more (e.g. with `admin()`). Plugin tables are created at runtime. The admin login supports email and password only; plugins that need UI work on the server only.
  - Payload mapping: `beforeLogin` → `hooks.before`, `afterLogin` → `hooks.after` with `ctx.path === '/sign-in/email'`, `afterLogout` → `ctx.path === '/sign-out'`, `afterForgotPassword` → `ctx.path === '/request-password-reset'`. Check each path against better-auth 1.7 before writing it.
  - Scripts table: remove `db:generate`. Status: "SQLite via libsql (local file or Turso), Kysely".
- `CLAUDE.md`:
  - Commands: remove `db:generate`. Add: core migrations are code in `src/db/index.ts`; add a new key, never edit a shipped one.
  - Architecture: `src/auth.ts` (`authOptions()` merges host options; core owns `database`, `basePath`, `secret`), `src/db/` (Kysely, `libsqlDialect`, `Database` interface, `Migrator` with inline migrations, then `getMigrations()` for auth tables).
  - Design decisions: replace "Core owns the fixed tables only …drizzle-kit…" with the Kysely version. Add the reason for the local dialect.
  - Gotchas: `:memory:` has one connection, so code inside a transaction MUST use `trx`, or it gets `TRANSACTION_ACTIVE`.
  - Versions: replace `drizzle-orm 0.45` with `kysely 0.29`.

Commit: `docs: describe kysely layer and auth options`

### Task 12: Final verification

1. `pnpm test`: all green.
2. `pnpm typecheck` (no dev watcher running).
3. `pnpm build`.
4. Curl smoke test from `CLAUDE.md` on each example. Delete the example's `cms.db` before and after. Stop stale daemons first (`npx astro dev stop` in `examples/astro`).
   - Astro: `pnpm dev:astro`, `B=localhost:4321`.
   - Nuxt: `pnpm dev:nuxt`, `B=localhost:3000`. Also run the production build once (`HOST=127.0.0.1 PORT=3200` with its own absolute `NUXT_DATABASE_URL`), because the native binary tracing only shows up there.
   - TanStack Start: `pnpm dev:tanstack`, `B=localhost:3100`. Use `grep -a` on the page HTML.
   - Expect 200, 201, and `Hello` in the page HTML each time.

## Open risks

- **Social sign-in and magic links for new users.** The session-based rule blocks them once a user exists. Invited users need an account created by a signed-in admin first.
- **`:memory:` and concurrency.** With one connection, a request that arrives while another request's transaction is open fails with `TRANSACTION_ACTIVE`. Only matters for tests and in-memory demos; spec 3 must pass `trx` down to nested `cms` calls.
- **Transactions in writes.** The spec says writes use `db.transaction()`. This plan leaves single-statement writes as they are and defers wrapping to spec 3.
