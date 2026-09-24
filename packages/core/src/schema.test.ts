import { describe, expect, it } from 'vitest'
import { defineCms } from './index.ts'
import { type Collection, type Data, dataSchema, defineCollection, type Fields } from './schema.ts'

describe('dataSchema', () => {
  const schema = dataSchema({
    title: { type: 'text', required: true },
    body: { type: 'textarea' },
    views: { type: 'number' },
    featured: { type: 'boolean' },
    publishedAt: { type: 'date' },
    status: { type: 'select', options: ['draft', 'published'] },
  })

  it('accepts valid data and strips unknown keys', () => {
    expect(schema.parse({ title: 'Hi', views: 3, featured: true, publishedAt: '2026-09-23', status: 'draft', extra: 1 })).toEqual({
      title: 'Hi',
      views: 3,
      featured: true,
      publishedAt: '2026-09-23',
      status: 'draft',
    })
  })

  it('allows optional fields to be missing or null', () => {
    expect(schema.safeParse({ title: 'Hi', body: null, views: null }).success).toBe(true)
  })

  it('rejects a missing or empty required text', () => {
    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ title: '' }).success).toBe(false)
  })

  it('rejects values of the wrong type', () => {
    expect(schema.safeParse({ title: 'Hi', views: '3' }).success).toBe(false)
    expect(schema.safeParse({ title: 'Hi', featured: 'true' }).success).toBe(false)
    expect(schema.safeParse({ title: 'Hi', publishedAt: '23.09.2026' }).success).toBe(false)
    expect(schema.safeParse({ title: 'Hi', status: 'archived' }).success).toBe(false)
  })
})

describe('group', () => {
  const schema = dataSchema({
    seo: {
      type: 'group',
      fields: {
        title: { type: 'text', required: true },
        meta: { type: 'group', fields: { robots: { type: 'text' } } },
      },
    },
    address: { type: 'group', required: true, fields: { city: { type: 'text' } } },
  })

  it('validates nested data and strips unknown keys at every depth', () => {
    expect(schema.parse({ seo: { title: 'T', x: 1, meta: { robots: 'noindex', y: 2 } }, address: { city: 'B', z: 3 } })).toEqual({
      seo: { title: 'T', meta: { robots: 'noindex' } },
      address: { city: 'B' },
    })
  })

  it('allows an optional group to be missing or null and skips its required fields then', () => {
    expect(schema.safeParse({ address: {} }).success).toBe(true)
    expect(schema.safeParse({ seo: null, address: {} }).success).toBe(true)
  })

  it('requires a required group', () => {
    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ address: null }).success).toBe(false)
  })

  it('checks required and typed fields inside a present group', () => {
    expect(schema.safeParse({ seo: {}, address: {} }).success).toBe(false)
    expect(schema.safeParse({ seo: { title: 'T', meta: { robots: 1 } }, address: {} }).success).toBe(false)
  })
})

describe('group types', () => {
  const fields = {
    seo: { type: 'group', fields: { title: { type: 'text' }, noindex: { type: 'boolean' } } },
    address: { type: 'group', required: true, fields: { geo: { type: 'group', fields: { lat: { type: 'number' } } } } },
  } as const satisfies Fields

  it('infers nested group types', () => {
    // Type-level only. The function never runs.
    ;(d: Data<typeof fields>) => {
      const title: string | null | undefined = d.seo?.title
      const lat: number | null | undefined = d.address.geo?.lat
      // @ts-expect-error an optional group can be null
      d.seo.title
      // @ts-expect-error `noindex` is a boolean
      const n: string | null | undefined = d.seo?.noindex
    }
  })
})

describe('relation values', () => {
  const s = dataSchema({
    author: { type: 'relation', collection: 'authors' },
    tags: { type: 'relation', collection: 'tags', many: true },
    lead: { type: 'relation', collection: 'authors', required: true, many: true },
    posts: { type: 'join', collection: 'posts', on: 'author' },
  })

  it('accepts ids, keeps order and strips joins', () => {
    expect(s.parse({ author: 'a', tags: ['y', 'x'], lead: ['a'], posts: ['p'] })).toEqual({ author: 'a', tags: ['y', 'x'], lead: ['a'] })
  })

  it('rejects duplicates, empty ids and an empty required many', () => {
    expect(s.safeParse({ lead: ['a', 'a'] }).success).toBe(false)
    expect(s.safeParse({ lead: ['a'], author: '' }).success).toBe(false)
    expect(s.safeParse({ lead: [] }).success).toBe(false)
    expect(s.safeParse({ lead: ['a'], tags: 'x' }).success).toBe(false)
  })
})

// Checked by `pnpm typecheck` only.
function writeTypes() {
  const fields = defineCollection({
    fields: {
      author: { type: 'relation', collection: 'authors', required: true },
      tags: { type: 'relation', collection: 'tags', many: true },
      posts: { type: 'join', collection: 'posts', on: 'author' },
    },
  }).fields
  const d: Data<typeof fields> = { author: 'a', tags: ['t'] }
  const t: string[] | null | undefined = d.tags
  // @ts-expect-error joins are not stored
  d.posts
  // @ts-expect-error a relation is written as ids
  const bad: Data<typeof fields> = { author: { id: 'a' } }
  // @ts-expect-error `required` does not apply to joins
  defineCollection({ fields: { p: { type: 'join', collection: 'posts', on: 'author', required: true } } })
}

const database = { url: ':memory:' }
const cms = defineCms({
  collections: {
    media: { fields: { url: { type: 'text', required: true }, usedIn: { type: 'join', collection: 'posts', on: 'seo.image' } } },
    authors: {
      fields: {
        name: { type: 'text', required: true },
        avatar: { type: 'relation', collection: 'media' },
        posts: { type: 'join', collection: 'posts', on: 'author' },
      },
    },
    tags: { fields: { name: { type: 'text', required: true }, posts: { type: 'join', collection: 'posts', on: 'tags' } } },
    posts: {
      fields: {
        title: { type: 'text', required: true },
        author: { type: 'relation', collection: 'authors' },
        tags: { type: 'relation', collection: 'tags', many: true },
        seo: { type: 'group', fields: { image: { type: 'relation', collection: 'media' } } },
      },
    },
    pages: { fields: { title: { type: 'text', required: true }, parent: { type: 'relation', collection: 'pages', onDelete: 'cascade' } } },
  },
  globals: { site: { fields: { logo: { type: 'relation', collection: 'media' }, featured: { type: 'relation', collection: 'posts', many: true } } } },
  database,
  secret: '',
})

// Checked by `pnpm typecheck` only.
async function readTypes() {
  const p = (await cms.find('posts'))[0]
  const name: string = p.author!.name
  const url: string | null | undefined = p.author?.avatar?.url
  const t: string = p.tags![0].name
  const img: string | null | undefined = p.seo?.image?.url
  const ids = (await cms.find('posts', { populate: false }))[0]
  const aid: string | null | undefined = ids.author
  const one = await cms.findById('posts', 'x', { populate: false })
  const aid2: string | null | undefined = one?.author
  const a = (await cms.find('authors'))[0]
  // @ts-expect-error joins are absent unless named
  a.posts
  // @ts-expect-error `populate: false` returns ids
  ids.author?.name

  const d1 = (await cms.find('posts', { depth: 1 }))[0]
  const av: string | null | undefined = d1.author?.avatar
  const d0 = (await cms.find('posts', { depth: 0 }))[0]
  const s: string | null | undefined = d0.author
  const deep = defineCms({
    collections: { pages: { fields: { parent: { type: 'relation', collection: 'pages' } } } },
    populate: { depth: 3 },
    database,
    secret: '',
  })
  const pg = (await deep.find('pages'))[0]
  const p3: string | null | undefined = pg.parent?.parent?.parent?.parent
  // @ts-expect-error depth 3 ends at the fourth hop
  pg.parent?.parent?.parent?.parent?.id

  const o = (await cms.find('posts', { populate: { author: { avatar: true }, tags: true } }))[0]
  const u: string | null | undefined = o.author?.avatar?.url
  const oimg: string | null | undefined = o.seo?.image
  const g = (await cms.find('posts', { populate: { seo: { image: true } } }))[0]
  const gu: string | undefined = g.seo?.image?.url
  const g1 = (await cms.find('posts', { populate: { seo: true } }))[0]
  const gu1: string | undefined = g1.seo?.image?.url
  // @ts-expect-error unknown key
  cms.find('posts', { populate: { autor: true } })
  // @ts-expect-error unknown nested key
  cms.find('posts', { populate: { author: { avatr: true } } })
  // @ts-expect-error scalars cannot be populated
  cms.find('posts', { populate: { title: true } })
  // @ts-expect-error an extra key next to a valid one
  cms.find('posts', { populate: { author: true, nope: true } })

  const wide = defineCms({ collections: {} as Record<string, Collection>, database, secret: '' })
  const w = (await wide.find('x'))[0]
  w.anything
}
