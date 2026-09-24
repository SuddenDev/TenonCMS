import { type Client, createClient, type Transaction } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { type DatabaseConnection, type Dialect, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely'
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

type Connection = DatabaseConnection & { tx?: Transaction }

// Same shape as `@libsql/kysely-libsql`, over our own `@libsql/client`. That package pulls a second client and native binary.
export function libsqlDialect(client: Client): Dialect {
  return {
    createAdapter: () => new SqliteAdapter(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
    createDriver: () => ({
      async init() {},
      async acquireConnection() {
        const connection: Connection = {
          async executeQuery(query) {
            const result = await (connection.tx ?? client).execute({ sql: query.sql, args: query.parameters as any[] })
            return {
              rows: result.rows as any[],
              numAffectedRows: BigInt(result.rowsAffected),
              insertId: result.lastInsertRowid,
            }
          },
          streamQuery() {
            throw new Error('libsql dialect does not support streaming')
          },
        }
        return connection
      },
      async beginTransaction(connection: Connection) {
        connection.tx = await client.transaction('write')
      },
      async commitTransaction(connection: Connection) {
        await connection.tx!.commit()
        connection.tx = undefined
      },
      async rollbackTransaction(connection: Connection) {
        await connection.tx!.rollback()
        connection.tx = undefined
      },
      async releaseConnection() {},
      async destroy() {
        client.close()
      },
    }),
  }
}
