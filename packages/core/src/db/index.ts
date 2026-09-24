import { type Client, createClient, type Transaction } from '@libsql/client'
import type { BetterAuthOptions } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import {
  type DatabaseConnection,
  type Dialect,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  sql,
} from 'kysely'
import { type Migration, Migrator } from 'kysely/migration'

export interface Database {
  cms_documents: { id: string; collection: string; data: string; created_at: number; updated_at: number }
  cms_globals: { name: string; data: string; created_at: number; updated_at: number }
}

export function createDb(url: string, authToken?: string) {
  return new Kysely<Database>({ dialect: libsqlDialect(createClient({ url, authToken })) })
}

// Keys sort by name. Never edit a migration that has shipped; add a new one.
const cmsMigrations: Record<string, Migration> = {
  '001_cms_tables': {
    async up(db) {
      await sql`CREATE TABLE IF NOT EXISTS cms_documents (
        id text PRIMARY KEY NOT NULL,
        collection text NOT NULL,
        data text NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      )`.execute(db)
      await sql`CREATE INDEX IF NOT EXISTS cms_documents_collection_idx ON cms_documents (collection)`.execute(db)
      await sql`CREATE TABLE IF NOT EXISTS cms_globals (
        name text PRIMARY KEY NOT NULL,
        data text NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      )`.execute(db)
    },
  },
}

// ponytail: no locking between processes; Kysely's migration lock is a no-op on SQLite. Run one instance per database until D1/Postgres.
// Auth tables come from better-auth after the CMS tables, plugin tables included.
export async function migrate(db: Kysely<Database>, authOptions: BetterAuthOptions) {
  const { error } = await new Migrator({
    db,
    provider: { getMigrations: async () => cmsMigrations },
    migrationTableName: 'cms_kysely_migration',
    migrationLockTableName: 'cms_kysely_migration_lock',
  }).migrateToLatest()
  if (error) throw error
  await (await getMigrations(authOptions)).runMigrations()
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
