import { APIError, betterAuth, type BetterAuthOptions } from 'better-auth'
import { type Kysely, sql } from 'kysely'
import { API_BASE } from './client.ts'
import type { Database } from './db/index.ts'

type UserCreate = NonNullable<NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['user']>['create']>
type BeforeCreate = Parameters<NonNullable<UserCreate['before']>>
type Model = 'user' | 'session' | 'account' | 'verification'

// Core reads the `user` table by name, so models MUST keep their default names.
// `never` also rejects `modelName` next to valid keys; generic inference skips excess property checks.
export type AuthOptions = Omit<BetterAuthOptions, 'database' | 'basePath' | 'secret' | Model> & {
  [K in Model]?: Omit<NonNullable<BetterAuthOptions[K]>, 'modelName'> & { modelName?: never }
}

export function authOptions<A extends AuthOptions>(db: Kysely<Database>, secret: string, host: A) {
  const create = host.databaseHooks?.user?.create
  return {
    ...host,
    basePath: `${API_BASE}/auth`,
    secret,
    database: { db, type: 'sqlite' as const },
    // The admin login needs email and password, so core MUST force it on.
    emailAndPassword: { ...host.emailAndPassword, enabled: true },
    databaseHooks: {
      ...host.databaseHooks,
      user: {
        ...host.databaseHooks?.user,
        create: {
          ...create,
          // Core MUST run first, so a host hook cannot reopen public sign-up.
          async before(user: BeforeCreate[0], ctx: BeforeCreate[1]) {
            await firstUserOnly(db, ctx)
            return create?.before?.(user, ctx)
          },
        },
      },
    },
  } satisfies BetterAuthOptions
}

// Once a user exists, only a request with a session MAY create users, whatever the endpoint.
// Server code without a request is trusted, as in better-auth's admin plugin.
async function firstUserOnly(db: Kysely<Database>, ctx: BeforeCreate[1]) {
  if (!ctx?.request && !ctx?.headers) return
  if (ctx.context.session) return
  const { rows } = await sql<{ n: number }>`SELECT count(*) AS n FROM "user"`.execute(db)
  if (rows[0].n > 0) throw new APIError('FORBIDDEN', { message: 'Sign-up is closed' })
}

export function createAuth<O extends BetterAuthOptions>(options: O) {
  return betterAuth(options)
}
