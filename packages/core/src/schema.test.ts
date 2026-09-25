import { describe, expect, it } from 'vitest'
import { createClient } from './client.ts'
import { matchCondition } from './condition.ts'
import { defineCms } from './index.ts'
import { page } from './presets.ts'
import { type Collection, type Data, dataSchema, defineCollection, defineGlobal, type Doc, type Fields } from './schema.ts'

describe('matchCondition', () => {
  const d = { type: 'video', price: 5, tag: '', date: '2026-09-24' }
  it.each([
    [{ type: 'video' }, true],
    [{ type: { eq: 'image' } }, false],
    [{ type: { ne: 'image' } }, true],
    [{ type: { in: ['video', 'youtube'] } }, true],
    [{ type: { notIn: ['video'] } }, false],
    [{ price: { gt: 5 } }, false],
    [{ price: { gte: 5 } }, true],
    [{ price: { lt: 10, gt: 0 } }, true],
    [{ date: { lte: '2026-12-31' } }, true],
    [{ price: { gt: '1' } }, false],
    [{ missing: { gt: 0 } }, false],
    [{ tag: { exists: false } }, true],
    [{ type: { exists: true } }, true],
    [{ missing: null }, true],
    [{ type: 'video', price: 6 }, false],
  ])('supports every operator: %j → %s', (c, expected) => expect(matchCondition(c, d)).toBe(expected))

  it('nests $every and $some', () => {
    const c = { $some: [{ type: 'video' }, { $every: [{ type: 'image' }, { price: { gt: 0 } }] }] }
    expect(matchCondition(c, { type: 'video' })).toBe(true)
    expect(matchCondition(c, { type: 'image', price: 1 })).toBe(true)
    expect(matchCondition(c, { type: 'image', price: 0 })).toBe(false)
    expect(matchCondition({ $every: [] }, {})).toBe(true)
    expect(matchCondition({ $some: [] }, {})).toBe(false)
  })

  it('reads siblings inside a group and root paths with /', () => {
    const data = { mode: 'advanced', settings: { mode: 'simple', color: 'red' } }
    expect(matchCondition({ mode: 'simple' }, data, data.settings)).toBe(true)
    expect(matchCondition({ '/mode': 'advanced' }, data, data.settings)).toBe(true)
    expect(matchCondition({ '/settings.color': 'red' }, data, data.settings)).toBe(true)
  })
})

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

  it('checks length, pattern and range, but not empty optional values', () => {
    const s = dataSchema({
      slug: { type: 'text', minLength: 2, maxLength: 4, pattern: '[a-z]+' },
      n: { type: 'number', min: 1, max: 3 },
      body: { type: 'textarea', minLength: 5 },
      title: { type: 'text', required: true, minLength: 3 },
    })
    expect(s.safeParse({ slug: 'abc', n: 2, title: 'abc' }).success).toBe(true)
    expect(s.safeParse({ slug: '', n: null, body: '', title: 'abc' }).success).toBe(true)
    for (const bad of [{ slug: 'a' }, { slug: 'abcde' }, { slug: 'ab1' }, { slug: 'xab!' }, { n: 0 }, { n: 4 }, { body: 'abc' }, { title: 'ab' }])
      expect(s.safeParse({ title: 'abc', ...bad }).success, JSON.stringify(bad)).toBe(false)
    expect(s.safeParse({ title: '' }).success).toBe(false)
  })

  it('matches the whole value', () => {
    expect(dataSchema({ x: { type: 'text', pattern: 'a|b' } }).safeParse({ x: 'ab' }).success).toBe(false)
  })

  it('rejects an invalid pattern', () => {
    expect(() => dataSchema({ x: { type: 'text', pattern: '(' } })).toThrow()
  })

  it('skips required and checks for fields whose condition is false, but keeps type checks', () => {
    const fields = {
      mediaType: { type: 'select', options: ['image', 'youtube'] },
      url: { type: 'text', required: true, pattern: 'https://.+', condition: { mediaType: 'youtube' } },
      settings: {
        type: 'group',
        fields: {
          mode: { type: 'text' },
          extra: { type: 'text', required: true, condition: { '/mediaType': 'youtube' } },
          local: { type: 'text', required: true, condition: { mode: 'x' } },
        },
      },
      off: { type: 'group', required: true, condition: { mediaType: 'youtube' }, fields: { a: { type: 'number', required: true } } },
    } as const satisfies Fields
    const parse = (d: object) => dataSchema(fields, d).safeParse(d)
    expect(parse({ mediaType: 'image', settings: {} }).success).toBe(true)
    expect(parse({ mediaType: 'image', url: 'nope', settings: {} })).toMatchObject({ success: true, data: { url: 'nope' } })
    expect(parse({ mediaType: 'image', url: 5 }).success).toBe(false)
    expect(parse({ mediaType: 'image', off: { a: 'x' } }).success).toBe(false)
    expect(parse({ mediaType: 'image', off: {} }).success).toBe(true)
    expect(parse({ mediaType: 'image', settings: { mode: 'x' } }).success).toBe(false)
    expect(parse({ mediaType: 'youtube', url: 'nope', settings: { extra: 'x' }, off: { a: 1 } }).success).toBe(false)
    expect(parse({ mediaType: 'youtube', url: 'https://y.t', settings: {}, off: { a: 1 } }).success).toBe(false)
    expect(parse({ mediaType: 'youtube', url: 'https://y.t', settings: { extra: 'x' }, off: { a: 1 } }).success).toBe(true)
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
// `satisfies` checks excess keys, which generic inference in `defineCollection` skips.
function optionTypes() {
  ;({
    a: {
      type: 'text',
      minLength: 1,
      maxLength: 9,
      pattern: '[a-z]+',
      placeholder: 'x',
      description: 'Help',
      default: 'x',
      condition: { b: { gt: 0 } },
      unique: true,
      private: true,
      validate: (v) => v !== 'no' || 'Not allowed',
    },
    b: { type: 'number', min: 0, max: 9, default: ({ user }) => (user ? 1 : 0) },
    r: { type: 'relation', collection: 'authors', default: ({ user }) => user?.id, validate: (v, { siblingData }) => !!v || String(siblingData.a) },
    h: { type: 'text', description: 'Secret', condition: { $some: [{ a: 'x' }, { '/b': { exists: true } }] } },
    j: { type: 'join', collection: 'posts', on: 'author', description: 'Posts', private: true },
    // @ts-expect-error `min` is for numbers
    c: { type: 'text', min: 1 },
    // @ts-expect-error `pattern` is for text
    d: { type: 'number', pattern: '1' },
    // @ts-expect-error a RegExp cannot reach the admin
    e: { type: 'text', pattern: /x/ },
    // @ts-expect-error `placeholder` is not for booleans
    f: { type: 'boolean', placeholder: 'x' },
    // @ts-expect-error a default has the field's type
    g: { type: 'number', default: 'x' },
    // @ts-expect-error joins are not stored, so they have no default
    k: { type: 'join', collection: 'posts', on: 'author', default: [] },
  }) satisfies Fields
}

describe('slug', () => {
  const s = dataSchema({ slug: { type: 'slug', from: 'title' } })

  it('requires a slug that matches the pattern', () => {
    for (const ok of ['a', 'about-us', 'v2']) expect(s.safeParse({ slug: ok }).success, ok).toBe(true)
    for (const bad of [{}, { slug: null }, { slug: '' }, { slug: 'Not Valid' }, { slug: 'a--b' }, { slug: '-a' }, { slug: 'a-' }])
      expect(s.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
  })
})

// Checked by `pnpm typecheck` only.
function slugTypes() {
  const f = { slug: { type: 'slug', from: 'title', parent: 'parent', path: 'path' } } as const satisfies Fields
  ;(d: Data<typeof f>) => d.slug satisfies string
  // @ts-expect-error a slug is always required
  const missing: Data<typeof f> = {}
  // @ts-expect-error `required` does not apply to slugs
  defineCollection({ fields: { s: { type: 'slug', required: false } } })
  const read = async () => {
    const doc = await defineCms({ collections: { c: { fields: f } }, database, secret: '' }).findById('c', 'x')
    doc?.slug satisfies string | undefined
  }
}

// Checked by `pnpm typecheck` only.
function pageTypes() {
  const pages = defineCollection({ fields: { ...page.fields, body: { type: 'textarea' } }, hooks: page.hooks })
  ;(d: Doc<typeof pages.fields>) => [d.title, d.slug, d.path] satisfies [string, string, string | null | undefined]
}

// Checked by `pnpm typecheck` only.
function readOnlyTypes() {
  const fields = {
    title: { type: 'text', required: true },
    path: { type: 'text', readOnly: true },
    seo: { type: 'group', readOnly: true, fields: { title: { type: 'text', readOnly: true } } },
  } as const satisfies Fields
  const input: Data<typeof fields> = { title: 'A', path: '/a', seo: { title: 'S' } }
}

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

  const j = (await cms.find('authors', { populate: { posts: true } }))[0]
  const title: string = j.posts[0].title
  const author: string | null | undefined = j.posts[0].author
  const jj = (await cms.find('authors', { populate: { posts: { tags: true } } }))[0]
  const tag: string = jj.posts[0].tags![0].name
  const site = await cms.getGlobal('site')
  const logo: string | null | undefined = site.logo?.url
  const siteIds = await cms.getGlobal('site', { populate: false })
  const logoId: string | null | undefined = siteIds.logo
  // @ts-expect-error unknown global populate key
  cms.getGlobal('site', { populate: { nope: true } })

  const wide = defineCms({ collections: {} as Record<string, Collection>, database, secret: '' })
  const w = (await wide.find('x'))[0]
  w.anything
}

// Checked by `pnpm typecheck` only.
async function httpTypes() {
  const cms = defineCms({
    collections: {
      people: {
        fields: {
          name: { type: 'text', required: true, private: true },
          profile: { type: 'group', fields: { bio: { type: 'text' }, note: { type: 'text', required: true, private: true } } },
        },
      },
      posts: { fields: { author: { type: 'relation', collection: 'people' } } },
    },
    database,
    secret: '',
  })
  const client = createClient<typeof cms>()
  const person = await client.findById('people', 'x')
  const bio: string | null | undefined = person.profile?.bio
  // @ts-expect-error private fields are missing on public reads
  const name: string = person.name
  // @ts-expect-error also inside groups
  const note: string = person.profile!.note
  const local = await cms.findById('people', 'x')
  local?.name satisfies string | undefined
  const post = await client.findById('posts', 'x')
  // @ts-expect-error also in populated documents
  const author: string = post.author!.name
  client.create('people', {})
}

describe('hook types', () => {
  it('infers arguments from the fields of the same defineCollection call', () => {
    const posts = defineCollection({
      fields: {
        title: { type: 'text', required: true, hooks: { beforeChange: [({ value }) => value?.toUpperCase()] } },
        views: { type: 'number' },
      },
      hooks: {
        beforeChange: [
          ({ data }) => {
            data.title satisfies string
            // @ts-expect-error unknown field
            data.nope
          },
        ],
        afterRead: { count: ({ docs }) => docs.map((d) => ({ ...d, views: (d.views ?? 0) + 1 })) },
      },
    })
    defineCms({ collections: { posts }, database: { url: ':memory:' }, secret: '' })
    // A record keeps its keys, so a host can leave one hook out by name.
    const { count, ...rest } = posts.hooks.afterRead
    defineCollection({ fields: posts.fields, hooks: { afterRead: rest } })
    expect(defineCollection({ fields: {} }).hooks).toEqual({})
    expect(defineGlobal({ fields: {} }).hooks).toEqual({})
    // @ts-expect-error field hook value is a number
    defineCollection({ fields: { n: { type: 'number', hooks: { beforeChange: [({ value }) => value?.toUpperCase()] } } } })
    const site = defineGlobal({
      fields: { name: { type: 'text' } },
      hooks: { afterRead: [({ docs }) => docs.map((d) => ({ ...d, name: d.name ?? 'x' }))] },
    })
    defineCms({ collections: {}, globals: { site }, database: { url: ':memory:' }, secret: '' })
    // Inline collections get untyped arguments.
    defineCms({
      collections: { a: { fields: { t: { type: 'text' } }, hooks: { beforeChange: [({ data }) => ({ ...data, t: data.anything })] } } },
      database: { url: ':memory:' },
      secret: '',
    })
  })
})

describe('defineCms checks', () => {
  const define = (collections: Record<string, Collection>, globals: Record<string, { fields: Fields }> = {}) => () =>
    defineCms({ collections, globals, database: { url: ':memory:' }, secret: 'x'.repeat(32) })
  const g = { type: 'group', fields: { t: { type: 'text' } } } as const

  it('throws for a condition on an unknown field', () => {
    expect(define({ c: { fields: { a: { type: 'text', condition: { nope: 1 } } } } })).toThrow(/"c.a" names unknown field "nope"/)
    expect(define({ c: { fields: { g, a: { type: 'text', condition: { '/g.nope': 1 } } } } })).toThrow(/unknown field "\/g.nope"/)
    expect(define({ c: { fields: { a: { type: 'text', condition: { $some: [{ $every: [{ nope: 1 }] }] } } } } })).toThrow(/unknown field "nope"/)
    const root = { x: { type: 'text' }, g: { type: 'group', fields: { a: { type: 'text', condition: { x: 1 } } } } } as const
    expect(define({ c: { fields: root } })).toThrow(/"c.g.a" names unknown field "x"/)
    expect(define({}, { s: { fields: { a: { type: 'text', condition: { nope: 1 } } } } })).toThrow(/unknown field "nope"/)
  })

  it('accepts conditions on siblings, root paths and group paths', () => {
    const fields = {
      x: { type: 'text' },
      g,
      a: { type: 'text', condition: { x: 1, 'g.t': 'y', $some: [{ '/g.t': 'z' }] } },
      h: { type: 'group', fields: { t: { type: 'text' }, b: { type: 'text', condition: { t: 1, '/x': 2 } } } },
    } as const
    expect(define({ c: { fields } })).not.toThrow()
  })

  it('throws for unique inside a group, in a global, on boolean, custom, group, join and many relations', () => {
    const bad = [
      { g: { type: 'group', fields: { t: { type: 'text', unique: true } } } },
      { g: { type: 'group', fields: { s: { type: 'slug', unique: true } } } },
      { b: { type: 'boolean', unique: true } },
      { c: { type: 'custom:color', unique: true } },
      { g: { type: 'group', unique: true, fields: {} } },
      { j: { type: 'join', collection: 'c', on: 'r', unique: true }, r: { type: 'relation', collection: 'c' } },
      { r: { type: 'relation', collection: 'c', many: true, unique: true } },
    ] as Fields[]
    for (const fields of bad) expect(define({ c: { fields } }), JSON.stringify(fields)).toThrow(/cannot be unique/)
    expect(define({}, { s: { fields: { t: { type: 'text', unique: true } } } })).toThrow(/"s.t" cannot be unique/)
  })

  it('accepts unique on top-level text, textarea, number, date, select, slug and single relation fields', () => {
    const fields: Fields = {
      a: { type: 'text', unique: true },
      b: { type: 'textarea', unique: true },
      c: { type: 'number', unique: true },
      d: { type: 'date', unique: true },
      e: { type: 'select', options: ['x'], unique: true },
      f: { type: 'relation', collection: 'c', unique: true },
      g: { type: 'slug', from: 'a', unique: true },
    }
    expect(define({ c: { fields } })).not.toThrow()
  })

  it('throws for an invalid pattern, also under a condition', () => {
    expect(define({ c: { fields: { a: { type: 'text', pattern: '(' } } } })).toThrow()
    expect(define({ c: { fields: { x: { type: 'text' }, a: { type: 'text', pattern: '(', condition: { x: 'y' } } } } })).toThrow()
  })
})
