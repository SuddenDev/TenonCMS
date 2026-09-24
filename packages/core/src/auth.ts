import { APIError, betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { count } from 'drizzle-orm'
import { API_BASE } from './client.ts'
import { type Drizzle, schema } from './db/index.ts'

export function createAuth(db: Drizzle, secret: string) {
  return betterAuth({
    basePath: `${API_BASE}/auth`,
    secret,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    emailAndPassword: { enabled: true },
    databaseHooks: {
      user: {
        create: {
          // Only the first user may sign up. Later users MUST be invited by an admin.
          async before() {
            const [{ n }] = await db.select({ n: count() }).from(schema.user)
            if (n > 0) throw new APIError('FORBIDDEN', { message: 'Sign-up is closed' })
          },
        },
      },
    },
  })
}

