import { createClient } from '@libsql/client'
import { Kysely, sql } from 'kysely'
import { expect, it } from 'vitest'
import { createDb, libsqlDialect, migrate } from './index.ts'

it('rolls back an interactive transaction', async () => {
  const db = new Kysely<any>({ dialect: libsqlDialect(createClient({ url: ':memory:' })) })
  await sql`CREATE TABLE t (v TEXT)`.execute(db)
  const failed = db.transaction().execute(async (trx) => {
    await trx.insertInto('t').values({ v: 'a' }).execute()
    expect(await trx.selectFrom('t').selectAll().execute()).toEqual([{ v: 'a' }])
    throw new Error('boom')
  })
  await expect(failed).rejects.toThrow('boom')
  expect(await db.selectFrom('t').selectAll().execute()).toEqual([])
})

it('runs CMS migrations once', async () => {
  const db = createDb(':memory:')
  await migrate(db)
  await migrate(db)
  const { rows } = await sql<{ name: string }>`SELECT name FROM sqlite_master`.execute(db)
  expect(rows.map((r) => r.name)).toEqual(
    expect.arrayContaining(['cms_documents', 'cms_globals', 'cms_documents_collection_idx', 'cms_kysely_migration']),
  )
})
