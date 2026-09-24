import { APIError, betterAuth, type BetterAuthOptions } from 'better-auth'
import { type Kysely, sql } from 'kysely'
import { API_BASE } from './client.ts'
import type { Database } from './db/index.ts'

export function authOptions(db: Kysely<Database>, secret: string) {
  return {
    basePath: `${API_BASE}/auth`,
    secret,
    database: { db, type: 'sqlite' as const },
    emailAndPassword: { enabled: true },
    databaseHooks: {
      user: {
        create: {
          // Only the first user may sign up. Later users MUST be invited by an admin.
          async before() {
            const { rows } = await sql<{ n: number }>`SELECT count(*) AS n FROM "user"`.execute(db)
            if (rows[0].n > 0) throw new APIError('FORBIDDEN', { message: 'Sign-up is closed' })
          },
        },
      },
    },
  } satisfies BetterAuthOptions
}

export function createAuth<O extends BetterAuthOptions>(options: O) {
  return betterAuth(options)
}
