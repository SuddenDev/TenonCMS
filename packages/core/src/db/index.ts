import { createClient } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import migrations from './migrations.gen.ts'
import * as schema from './schema.ts'

export { schema }

export function createDb(url: string, authToken?: string) {
  return drizzle(createClient({ url, authToken }), { schema })
}

export type Db = ReturnType<typeof createDb>

// ponytail: no locking between processes. Use drizzle-kit migrate in CI when running more than one instance.
export async function migrate(db: Db) {
  await db.run(sql`CREATE TABLE IF NOT EXISTS cms_migrations (name TEXT PRIMARY KEY)`)
  const done = new Set((await db.all<{ name: string }>(sql`SELECT name FROM cms_migrations`)).map((r) => r.name))
  for (const m of migrations) {
    if (done.has(m.name)) continue
    const statements = m.sql.split('--> statement-breakpoint').map((s) => sql.raw(s))
    await db.batch([...statements.map((s) => db.run(s)), db.run(sql`INSERT INTO cms_migrations (name) VALUES (${m.name})`)] as any)
  }
}
