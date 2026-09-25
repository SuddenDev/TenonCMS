import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient as createLibsql } from '@libsql/client'
import { createAuthMiddleware } from 'better-auth/api'
import { admin as adminPlugin, anonymous, twoFactor } from 'better-auth/plugins'
import { beforeEach, describe, expect, it } from 'vitest'
import { CmsError, createClient } from './client.ts'
import { ConflictError, defineCms, defineCollection, defineGlobal, type PopulateConfig, type Schema, ValidationError } from './index.ts'

const origin = 'http://localhost'
const base = {
  collections: {
    posts: {
      fields: {
        title: { type: 'text', required: true },
        views: { type: 'number' },
        featured: { type: 'boolean' },
        seo: { type: 'group', label: 'SEO', fields: { title: { type: 'text' }, noindex: { type: 'boolean' } } },
      },
    },
  },
  globals: { site: { fields: { name: { type: 'text' } } } },
  database: { url: ':memory:' },
  secret: 'x'.repeat(32),
} as const
const define = (secret: string) => defineCms({ ...base, secret })

function setup<C extends { schema: Schema; fetch(request: Request): Promise<Response> } = ReturnType<typeof define>>(cms: C = define(base.secret) as never) {
  let cookie = ''
  // Keeps the session cookie between requests, like a browser.
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    headers.set('origin', origin)
    if (cookie) headers.set('cookie', cookie)
    const res = await cms.fetch(new Request(input, { ...init, headers }))
    const set = res.headers.getSetCookie().map((c) => c.split(';')[0])
    if (set.length) cookie = set.join('; ')
    return res
  }
  return { cms, fetch, client: createClient<typeof cms>({ baseUrl: origin, fetch }) }
}

let cms: ReturnType<typeof define>
let client: ReturnType<typeof setup<ReturnType<typeof define>>>['client']
let fetchWithSession: (path: string, init?: RequestInit) => Promise<Response>
beforeEach(() => {
  const s = setup()
  ;({ cms, client } = s)
  fetchWithSession = (path, init) => s.fetch(`${origin}/api/cms${path}`, init)
})

const admin = { name: 'Admin', email: 'a@b.co', password: 'password123' }

const tmpDb = () => `file:${mkdtempSync(join(tmpdir(), 'integral-'))}/cms.db`

async function tables(url: string) {
  const db = createLibsql({ url })
  try {
    return (await db.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)).rows.map((r) => r.name)
  } finally {
    db.close()
  }
}

async function status(promise: Promise<unknown>) {
  const error = await promise.then(() => undefined, (e: unknown) => e)
  return error instanceof CmsError ? error.status : error
}

const relational = (url = ':memory:', populate: PopulateConfig = {}) =>
  defineCms({
    collections: {
      media: { fields: { url: { type: 'text', required: true }, usedIn: { type: 'join', collection: 'posts', on: 'seo.image' } } },
      authors: {
        titleField: 'name',
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
      notes: {
        fields: {
          post: { type: 'relation', collection: 'posts', required: true },
          pin: { type: 'relation', collection: 'pages', required: true },
        },
      },
      pages: { fields: { title: { type: 'text', required: true }, parent: { type: 'relation', collection: 'pages', onDelete: 'cascade' } } },
    },
    globals: { site: { fields: { logo: { type: 'relation', collection: 'media' }, featured: { type: 'relation', collection: 'posts', many: true } } } },
    populate,
    database: { url },
    secret: 'x'.repeat(32),
  })

// Seeds one graph through the local API and returns the ids.
async function seed(cms: ReturnType<typeof relational>) {
  const m = await cms.create('media', { url: '/a.png' })
  const a = await cms.create('authors', { name: 'Ann', avatar: m.id })
  const [t1, t2] = [await cms.create('tags', { name: 'one' }), await cms.create('tags', { name: 'two' })]
  const p = await cms.create('posts', { title: 'Hi', author: a.id, tags: [t1.id, t2.id], seo: { image: m.id } })
  return { m, a, t1, t2, p }
}

describe('database', () => {
  it('creates CMS and auth tables on first access', async () => {
    const url = tmpDb()
    const cms = defineCms({ collections: { posts: { fields: {} } }, database: { url }, secret: 'x'.repeat(32) })
    await cms.find('posts')
    await cms.auth()
    expect(await tables(url)).toEqual(expect.arrayContaining(['cms_documents', 'cms_globals', 'user', 'session', 'account', 'verification']))
  })
})

describe('auth', () => {
  it('lets only the first user sign up', async () => {
    await client.signUp(admin)
    expect(await client.getSession()).toMatchObject({ user: { email: admin.email } })
    expect(await status(client.signUp({ ...admin, email: 'c@d.co' }))).toBe(403)
  })

  it('creates plugin tables at runtime and types plugin endpoints', async () => {
    const url = tmpDb()
    const cms = defineCms({ ...base, database: { url }, auth: { plugins: [twoFactor()] } })
    const auth = await cms.auth()
    expect(typeof auth.api.enableTwoFactor).toBe('function')
    expect(await tables(url)).toContain('twoFactor')
    ;() => {
      // @ts-expect-error core reads the `user` table by name
      defineCms({ ...base, auth: { user: { modelName: 'users' } } })
      // @ts-expect-error same for the other models
      defineCms({ ...base, auth: { session: { modelName: 'sessions', expiresIn: 60 } } })
    }
  })

  it('forces email sign-in on and keeps the host\'s other email options', async () => {
    const { client } = setup(defineCms({ ...base, auth: { emailAndPassword: { enabled: false, minPasswordLength: 20 } } }))
    expect(await status(client.signUp(admin))).toBe(400)
    const password = 'p'.repeat(20)
    await client.signUp({ ...admin, password })
    await client.signOut()
    await client.signIn({ ...admin, password })
    expect(await client.getSession()).not.toBeNull()
  })

  it('runs host database hooks after the first-user rule', async () => {
    const calls: string[] = []
    const { client } = setup(
      defineCms({
        ...base,
        auth: {
          databaseHooks: {
            user: {
              create: {
                before: async () => {
                  calls.push('before')
                },
                after: async (user) => {
                  calls.push(`after:${user.email}`)
                },
              },
            },
          },
        },
      }),
    )
    await client.signUp(admin)
    expect(await status(client.signUp({ ...admin, email: 'c@d.co' }))).toBe(403)
    expect(calls).toEqual(['before', 'after:a@b.co'])
  })

  it('lets a signed-in admin create users', async () => {
    // `defaultRole: 'admin'` makes the first user an admin.
    const cms = defineCms({ ...base, auth: { plugins: [adminPlugin({ defaultRole: 'admin' })] } })
    const { client, fetch } = setup(cms)
    await client.signUp(admin)
    const res = await fetch(`${origin}/api/cms/auth/admin/create-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'c@d.co', password: 'password123', name: 'C' }),
    })
    expect(res.status).toBe(200)
    expect(await status(client.signUp({ ...admin, email: 'e@f.co' }))).toBe(403)
    const auth = await cms.auth()
    await expect(auth.api.createUser({ body: { email: 'g@h.co', password: 'password123', name: 'G' } })).resolves.toBeDefined()
  })

  it('rejects user creation without a session on any endpoint', async () => {
    const cms = defineCms({ ...base, auth: { plugins: [anonymous()] } })
    await setup(cms).client.signUp(admin)
    const res = await cms.fetch(new Request(`${origin}/api/cms/auth/sign-in/anonymous`, { method: 'POST', headers: { origin } }))
    expect(res.status).toBe(403)
  })

  it('runs host request hooks', async () => {
    const paths: string[] = []
    const after = createAuthMiddleware(async (ctx) => {
      paths.push(ctx.path)
    })
    const { client } = setup(defineCms({ ...base, auth: { hooks: { after } } }))
    await client.signUp(admin)
    await client.signOut()
    await client.signIn(admin)
    expect(paths).toContain('/sign-in/email')
  })

  it('signs out and in again', async () => {
    await client.signUp(admin)
    await client.signOut()
    expect(await client.getSession()).toBeNull()
    expect(await status(client.signIn({ ...admin, password: 'wrong-password' }))).toBe(401)
    await client.signIn(admin)
    expect(await client.getSession()).not.toBeNull()
  })
})

describe('writes', () => {
  it('need a session', async () => {
    expect(await status(client.create('posts', { title: 'Hi' }))).toBe(401)
    expect(await status(client.setGlobal('site', { name: 'Site' }))).toBe(401)
    expect(await status(client.getSchema())).toBe(401)
  })

  it('reject cross-origin form posts', async () => {
    await client.signUp(admin)
    const res = await cms.fetch(
      new Request(`${origin}/api/cms/collections/posts`, {
        method: 'POST',
        headers: { origin: 'http://evil.test', 'content-type': 'application/x-www-form-urlencoded' },
        body: 'title=Hi',
      }),
    )
    expect(res.status).toBe(403)
  })

  it('validate data', async () => {
    await client.signUp(admin)
    expect(await status(client.create('posts', { title: '' }))).toBe(400)
    expect(await status(client.create('posts', { title: 'Hi', views: '3' } as never))).toBe(400)
  })

  it('create, update and delete a document', async () => {
    await client.signUp(admin)
    const post = await client.create('posts', { title: 'Hi', views: 1, extra: 'x' } as never)
    expect(post).toMatchObject({ title: 'Hi', views: 1 })
    expect(post).not.toHaveProperty('extra')
    expect(await client.update('posts', post.id, { title: 'Hello' })).toMatchObject({ id: post.id, title: 'Hello' })
    expect(await client.findById('posts', post.id)).not.toHaveProperty('views')
    await client.delete('posts', post.id)
    expect(await status(client.findById('posts', post.id))).toBe(404)
  })

  it('store and read a group', async () => {
    await client.signUp(admin)
    const post = await client.create('posts', { title: 'Hi', seo: { title: 'S', noindex: true, extra: 1 } as never })
    expect(post.seo).toEqual({ title: 'S', noindex: true })
    expect((await client.findById('posts', post.id)).seo).toEqual({ title: 'S', noindex: true })
  })

  it('reject invalid group data', async () => {
    await client.signUp(admin)
    expect(await status(client.create('posts', { title: 'Hi', seo: { noindex: 'yes' } } as never))).toBe(400)
  })

  it('set a global', async () => {
    await client.signUp(admin)
    expect(await client.getGlobal('site')).toEqual({})
    await client.setGlobal('site', { name: 'Site' })
    expect(await client.getGlobal('site')).toEqual({ name: 'Site' })
  })
})

describe('validation', () => {
  it('local API rejects invalid data with ValidationError', async () => {
    const error = await cms.create('posts', { title: '' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect(error).toMatchObject({ errors: { title: expect.any(String) } })
    await expect(cms.setGlobal('site', { name: 1 } as never)).rejects.toBeInstanceOf(ValidationError)
    expect(await cms.find('posts')).toEqual([])
  })

  it('HTTP returns field errors', async () => {
    await client.signUp(admin)
    const json = { method: 'POST', headers: { 'content-type': 'application/json' } }
    const res = await fetchWithSession('/collections/posts', { ...json, body: JSON.stringify({ title: '', seo: { noindex: 'x' } }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ errors: { title: expect.any(String), 'seo.noindex': expect.any(String) } })
    const error = await client.create('posts', { title: '' }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 400, message: expect.stringMatching(/./) })
  })
})

describe('reads', () => {
  beforeEach(async () => {
    await cms.create('posts', { title: 'A', views: 1, featured: true })
    await cms.create('posts', { title: 'B', views: 2, featured: false })
    await cms.create('posts', { title: 'C', views: 2, featured: true })
  })

  it('are public and newest first', async () => {
    expect((await client.find('posts')).map((p) => p.title)).toEqual(['C', 'B', 'A'])
  })

  it('filter by field, coerced to its type', async () => {
    expect((await client.find('posts', { where: { featured: true } })).map((p) => p.title)).toEqual(['C', 'A'])
    expect((await client.find('posts', { where: { views: 2, featured: false } })).map((p) => p.title)).toEqual(['B'])
  })

  it('filter by null as the query value null', async () => {
    await cms.create('posts', { title: 'D' })
    expect((await client.find('posts', { where: { views: null } })).map((p) => p.title)).toEqual(['D'])
    expect((await client.find('posts', { where: { featured: null, views: null } })).map((p) => p.title)).toEqual(['D'])
    const res = await cms.fetch(new Request(`${origin}/api/cms/collections/posts?views=null`))
    expect((await res.json()).map((p: { title: string }) => p.title)).toEqual(['D'])
  })

  it('ignore empty query values', async () => {
    const res = await cms.fetch(new Request(`${origin}/api/cms/collections/posts?views=&title=`))
    expect(await res.json()).toHaveLength(3)
  })

  it('ignore undefined filters', async () => {
    expect(await client.find('posts', { where: { views: undefined } })).toHaveLength(3)
  })

  it('limit results', async () => {
    expect(await client.find('posts', { limit: 2 })).toHaveLength(2)
    expect(await client.findOne('posts', { where: { views: 2 } })).toMatchObject({ title: 'C' })
  })

  it.each(['?nope=1', '?seo=x', '?limit=0', '?limit=-1', '?limit=abc'])('reject %s', async (query) => {
    expect((await cms.fetch(new Request(`${origin}/api/cms/collections/posts${query}`))).status).toBe(400)
  })

  it('return 404 for unknown names', async () => {
    expect(await status(client.find('pages' as never))).toBe(404)
    expect(await status(client.getGlobal('nope' as never))).toBe(404)
    expect(await status(client.findById('posts', 'missing'))).toBe(404)
  })
})

describe('local API', () => {
  it('rejects unknown filter fields before they reach SQL', async () => {
    await expect(cms.find('posts', { where: { "x') OR 1=1 --": 1 } as never })).rejects.toThrow(/Unknown field/)
  })

  it('rejects group keys in where', async () => {
    await expect(cms.find('posts', { where: { seo: null } as never })).rejects.toThrow(/not filterable/)
  })

  it('rejects group keys in where at the type level', () => {
    ;() => {
      // @ts-expect-error `seo` is a group
      cms.find('posts', { where: { seo: null } })
      // @ts-expect-error `seo` is a group
      client.find('posts', { where: { seo: 'x' } })
    }
  })

  it('matches empty or missing fields with null and ignores undefined', async () => {
    await cms.create('posts', { title: 'A', views: null })
    await cms.create('posts', { title: 'B' })
    await cms.create('posts', { title: 'C', views: 3 })
    const titles = async (views: number | null | undefined) =>
      (await cms.find('posts', { where: { views } })).map((p) => p.title)
    expect(await titles(null)).toEqual(['B', 'A'])
    expect(await titles(undefined)).toEqual(['C', 'B', 'A'])
    expect(await titles(3)).toEqual(['C'])
  })

  it('keeps instances apart', async () => {
    await cms.create('posts', { title: 'A' })
    expect(await setup().cms.find('posts')).toEqual([])
  })
})

describe('errors', () => {
  const post = (path: string, body: string) =>
    cms.fetch(new Request(`${origin}/api/cms${path}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body }))

  it('reject a malformed JSON body with 400', async () => {
    await client.signUp(admin)
    const res = await fetchWithSession('/collections/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"title":' })
    expect(res.status).toBe(400)
  })

  it('reject invalid sign-up data', async () => {
    expect(await status(client.signUp({ ...admin, email: 'not-an-email' }))).toBe(400)
    expect(await status(client.signUp({ ...admin, password: 'short' }))).toBe(400)
    expect((await post('/auth/sign-up/email', '{')).status).toBe(400)
  })

  it('reject a forged session cookie', async () => {
    await client.signUp(admin)
    const res = await cms.fetch(
      new Request(`${origin}/api/cms/schema`, { headers: { origin, cookie: 'better-auth.session_token=forged.value' } }),
    )
    expect(res.status).toBe(401)
  })

  it('reject writes to unknown names with 404', async () => {
    await client.signUp(admin)
    expect(await status(client.create('pages' as never, { title: 'Hi' } as never))).toBe(404)
    expect(await status(client.setGlobal('nope' as never, {} as never))).toBe(404)
  })

  it('reject invalid global data', async () => {
    await client.signUp(admin)
    expect(await status(client.setGlobal('site', { name: 1 } as never))).toBe(400)
  })

  it('return 404 when updating a missing document', async () => {
    await client.signUp(admin)
    expect(await status(client.update('posts', 'missing', { title: 'Hi' }))).toBe(404)
  })

  it('reject invalid data on update', async () => {
    await client.signUp(admin)
    const { id } = await client.create('posts', { title: 'Hi' })
    expect(await status(client.update('posts', id, { title: '' }))).toBe(400)
    expect(await client.findById('posts', id)).toMatchObject({ title: 'Hi' })
  })

  it('do not find a document through another collection', async () => {
    const { id } = await cms.create('posts', { title: 'Hi' })
    expect(await cms.findById('other' as never, id)).toBeUndefined()
    expect(await cms.update('other' as never, id, {})).toBeUndefined()
    await cms.delete('other' as never, id)
    expect(await cms.findById('posts', id)).toBeDefined()
  })

  it.each(['?views=abc', '?featured=yes'])('reject a filter value of the wrong type: %s', async (query) => {
    expect((await cms.fetch(new Request(`${origin}/api/cms/collections/posts${query}`))).status).toBe(400)
  })

  it('keep reads working with a short secret, but fail auth', async () => {
    const bad = define('short')
    expect((await bad.fetch(new Request(`${origin}/api/cms/collections/posts`))).status).toBe(200)
    await expect(bad.auth()).rejects.toThrow(/at least 32 characters/)
    expect((await bad.fetch(new Request(`${origin}/api/cms/schema`))).status).toBe(500)
  })

  it('reject unknown options at the type level', () => {
    // @ts-expect-error `globalz` is not an option
    defineCms({ collections: {}, globalz: {}, database: { url: ':memory:' }, secret: '' })
  })
})

describe('relation schema', () => {
  const join = { type: 'join', collection: 'posts', on: 'author' }
  it.each([
    ['unknown target', { collections: { posts: { fields: { a: { type: 'relation', collection: 'nope' } } } } }, /unknown collection "nope"/],
    ['join on unknown field', { collections: { a: { fields: { p: { type: 'join', collection: 'posts', on: 'x' } } }, posts: { fields: {} } } }, /join "a.p"/],
    [
      'join on a non-relation',
      { collections: { a: { fields: { p: { type: 'join', collection: 'posts', on: 'title' } } }, posts: { fields: { title: { type: 'text' } } } } },
      /join "a.p"/,
    ],
    [
      'join on a relation to another collection',
      {
        collections: {
          a: { fields: { p: join } },
          b: { fields: {} },
          posts: { fields: { author: { type: 'relation', collection: 'b' } } },
        },
      },
      /join "a.p"/,
    ],
    ['required + set-null', { collections: { a: { fields: { r: { type: 'relation', collection: 'a', required: true, onDelete: 'set-null' } } } } }, /set-null/],
    ['join in a global', { collections: { posts: { fields: { author: { type: 'relation', collection: 'posts' } } } }, globals: { g: { fields: { p: join } } } }, /join/],
    [
      'join in a group',
      { collections: { a: { fields: { g: { type: 'group', fields: { p: join } } } }, posts: { fields: { author: { type: 'relation', collection: 'a' } } } } },
      /join/,
    ],
    ['depth above maxDepth', { collections: {}, populate: { depth: 6 } }, /maxDepth/],
    ['cascade in a global', { collections: { a: { fields: {} } }, globals: { g: { fields: { a: { type: 'relation', collection: 'a', onDelete: 'cascade' } } } } }, /cascade/],
  ])('rejects %s', (_, config, message) => {
    expect(() => defineCms({ ...(config as object), database: { url: ':memory:' }, secret: '' } as never)).toThrow(message)
  })

  it('accepts relations, joins through groups and self-references', () => {
    expect(() => relational()).not.toThrow()
  })

  it('checks relation targets and join paths at the type level', () => {
    const db = { database: { url: ':memory:' }, secret: '' }
    const authors = defineCollection({ fields: { name: { type: 'text' }, posts: { type: 'join', collection: 'posts', on: 'author' } } })
    const posts = defineCollection({
      fields: {
        author: { type: 'relation', collection: 'authors' },
        seo: { type: 'group', fields: { image: { type: 'relation', collection: 'posts' } } },
        parent: { type: 'relation', collection: 'posts', many: true },
      },
    })
    const site = defineGlobal({ fields: { home: { type: 'relation', collection: 'posts' } } })
    const unknown = defineCollection({ fields: { a: { type: 'relation', collection: '' } } })
    const inGroup = defineCollection({ fields: { g: { type: 'group', fields: { a: { type: 'relation', collection: 'nope' } } } } })
    const joinTarget = defineCollection({ fields: { p: { type: 'join', collection: 'nope', on: 'author' } } })
    const joinOnText = defineCollection({ fields: { p: { type: 'join', collection: 'authors', on: 'name' } } })
    const joinOnOther = defineCollection({ fields: { p: { type: 'join', collection: 'posts', on: 'author' } } })
    const badGlobal = defineGlobal({ fields: { home: { type: 'relation', collection: 'nope' } } })
    ;() => {
      defineCms({ ...db, collections: { posts, authors }, globals: { site } })
      // @ts-expect-error unknown collection
      defineCms({ ...db, collections: { posts, authors, unknown } })
      // @ts-expect-error unknown collection inside a group
      defineCms({ ...db, collections: { posts, authors, inGroup } })
      // @ts-expect-error join on an unknown collection
      defineCms({ ...db, collections: { posts, authors, joinTarget } })
      // @ts-expect-error join on a field that is not a relation
      defineCms({ ...db, collections: { posts, authors, joinOnText } })
      // @ts-expect-error join on a relation that points to another collection
      defineCms({ ...db, collections: { posts, authors, joinOnOther } })
      // @ts-expect-error relation in a global to an unknown collection
      defineCms({ ...db, collections: { posts, authors }, globals: { badGlobal } })
      // @ts-expect-error inline: unknown collection
      defineCms({ ...db, collections: { a: { fields: { b: { type: 'relation', collection: 'nope' } } } } })
      // @ts-expect-error inline: join on a field that is not a relation
      defineCms({ ...db, collections: { a: { fields: { b: { type: 'relation', collection: 'a' }, j: { type: 'join', collection: 'a', on: 'x' } } } } })
      defineCms({ ...db, collections: { a: { fields: { b: { type: 'relation', collection: 'a' }, j: { type: 'join', collection: 'a', on: 'b' } } } } })
    }
  })
})

describe('relation writes', () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>
  let ids: Awaited<ReturnType<typeof seed>>
  beforeEach(async () => {
    r = setup(relational())
    await r.client.signUp(admin)
    ids = await seed(r.cms)
  })

  it('rejects an unknown id', async () => {
    const { client } = r
    expect(await status(client.create('posts', { title: 'x', author: 'nope' }))).toBe(400)
    expect(await status(client.create('posts', { title: 'x', tags: ['nope'] }))).toBe(400)
    expect(await status(client.create('posts', { title: 'x', seo: { image: 'nope' } }))).toBe(400)
    expect(await status(client.setGlobal('site', { logo: 'nope' }))).toBe(400)
  })

  it('rejects an id from another collection', async () => {
    expect(await status(r.client.create('posts', { title: 'x', author: ids.t1.id }))).toBe(400)
  })

  it('rejects a self-reference', async () => {
    const page = await r.cms.create('pages', { title: 'p' })
    expect(await status(r.client.update('pages', page.id, { title: 'x', parent: page.id }))).toBe(400)
    expect(await r.cms.findById('pages', page.id)).not.toHaveProperty('parent')
  })

  it('returns ids', async () => {
    expect(await r.client.create('posts', { title: 'x', author: ids.a.id })).toMatchObject({ author: ids.a.id })
  })

  it('rejects duplicates over HTTP', async () => {
    expect(await status(r.client.create('posts', { title: 'x', tags: [ids.t1.id, ids.t1.id] }))).toBe(400)
  })
})

describe('relation filters', () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>
  let ids: Awaited<ReturnType<typeof seed>>
  beforeEach(async () => {
    r = setup(relational())
    ids = await seed(r.cms)
  })
  const get = (path: string) => r.cms.fetch(new Request(`${origin}/api/cms${path}`))

  it('filters by a single relation', async () => {
    expect((await r.cms.find('posts', { where: { author: ids.a.id } })).map((p) => p.id)).toEqual([ids.p.id])
    expect((await (await get(`/collections/posts?author=${ids.a.id}`)).json()).map((p: { id: string }) => p.id)).toEqual([ids.p.id])
  })

  it('rejects many relations and joins', async () => {
    await expect(r.cms.find('posts', { where: { tags: 'x' } as never })).rejects.toThrow(/not filterable/)
    await expect(r.cms.find('authors', { where: { posts: 'x' } as never })).rejects.toThrow(/not filterable/)
    expect((await get('/collections/posts?tags=x')).status).toBe(400)
    expect((await get('/collections/authors?posts=x')).status).toBe(400)
  })

  it('rejects many relations and joins at the type level', () => {
    ;() => {
      // @ts-expect-error many relations are not filterable
      r.cms.find('posts', { where: { tags: 'x' } })
      // @ts-expect-error joins are not filterable
      r.cms.find('authors', { where: { posts: 'x' } })
      // @ts-expect-error many relations are not filterable
      r.client.find('posts', { where: { tags: 'x' } })
    }
  })
})

describe('populate', () => {
  let cms: ReturnType<typeof relational>
  let ids: Awaited<ReturnType<typeof seed>>
  beforeEach(async () => {
    cms = relational()
    ids = await seed(cms)
  })

  it('resolves relations up to the default depth', async () => {
    const { a, m } = ids
    expect((await cms.find('posts'))[0]).toMatchObject({
      author: { id: a.id, name: 'Ann', avatar: { id: m.id, url: '/a.png' } },
      tags: [{ name: 'one' }, { name: 'two' }],
      seo: { image: { url: '/a.png' } },
    })
  })

  it('returns ids with populate: false', async () => {
    const { a, m, t1, t2 } = ids
    expect((await cms.find('posts', { populate: false }))[0]).toMatchObject({ author: a.id, tags: [t1.id, t2.id], seo: { image: m.id } })
  })

  it('resolves a missing target to null and drops it from many', async () => {
    const url = tmpDb()
    const cms = relational(url)
    const { a, t2 } = await seed(cms)
    const db = createLibsql({ url })
    await db.execute({ sql: 'DELETE FROM cms_documents WHERE id IN (?, ?)', args: [a.id, t2.id] })
    db.close()
    const post = (await cms.find('posts'))[0]
    expect(post.author).toBeNull()
    expect(post.tags).toMatchObject([{ name: 'one' }])
  })

  it('limits hops with depth', async () => {
    const { a, m } = ids
    expect((await cms.find('posts', { depth: 1 }))[0].author?.avatar).toBe(m.id)
    expect((await cms.find('posts', { depth: 0 }))[0].author).toBe(a.id)
  })

  it('ends cycles at the depth limit', async () => {
    const x = await cms.create('pages', { title: 'x' })
    const y = await cms.create('pages', { title: 'y', parent: x.id })
    await cms.update('pages', x.id, { title: 'x', parent: y.id })
    const doc = await cms.findById('pages', x.id, { depth: 3 })
    expect(doc?.parent?.id).toBe(y.id)
    expect(doc?.parent?.parent?.id).toBe(x.id)
    expect(doc?.parent?.parent?.parent?.id).toBe(y.id)
    expect(doc?.parent?.parent?.parent?.parent).toBe(x.id)
  })

  it('uses the config depth', async () => {
    const cms = relational(':memory:', { depth: 1 })
    const { m } = await seed(cms)
    expect((await cms.find('posts'))[0].author).toMatchObject({ avatar: m.id })
  })

  it('resolves only listed paths', async () => {
    const { m, t1, t2 } = ids
    const post = (await cms.find('posts', { populate: { author: { avatar: true } } }))[0]
    expect(post.author?.avatar?.url).toBe('/a.png')
    expect(post.tags).toEqual([t1.id, t2.id])
    expect(post.seo?.image).toBe(m.id)
  })

  it('resolves through groups', async () => {
    expect((await cms.find('posts', { populate: { seo: { image: true } } }))[0].seo?.image?.url).toBe('/a.png')
    expect((await cms.find('posts', { populate: { seo: true } }))[0].seo?.image?.url).toBe('/a.png')
  })

  it('ignores depth with an object', async () => {
    expect((await cms.find('posts', { populate: { author: true }, depth: 5 }))[0].author?.avatar).toBe(ids.m.id)
  })

  it('resolves a named join newest first', async () => {
    const { a, p } = ids
    const p2 = await cms.create('posts', { title: 'Two', author: a.id })
    const author = await cms.findById('authors', a.id, { populate: { posts: true } })
    expect(author?.posts.map((x) => x.id)).toEqual([p2.id, p.id])
    expect(author?.posts[0].author).toBe(a.id)
  })

  it('leaves unnamed joins out', async () => {
    expect(await cms.findById('authors', ids.a.id)).not.toHaveProperty('posts')
  })

  it('joins over many relations and groups', async () => {
    const { m, t2, p } = ids
    expect((await cms.findById('tags', t2.id, { populate: { posts: true } }))?.posts.map((x) => x.id)).toEqual([p.id])
    expect((await cms.findById('media', m.id, { populate: { usedIn: true } }))?.usedIn.map((x) => x.id)).toEqual([p.id])
    const b = await cms.create('authors', { name: 'Bo' })
    expect((await cms.findById('authors', b.id, { populate: { posts: true } }))?.posts).toEqual([])
  })

  it('nested paths go through a join', async () => {
    expect((await cms.findById('authors', ids.a.id, { populate: { posts: { tags: true } } }))?.posts[0].tags?.[0].name).toBe('one')
  })

  it('resolves global relations', async () => {
    const { m, p } = ids
    await cms.setGlobal('site', { logo: m.id, featured: [p.id] })
    const site = await cms.getGlobal('site')
    expect(site.logo?.url).toBe('/a.png')
    expect(site.featured?.[0].author?.name).toBe('Ann')
    expect(await cms.getGlobal('site', { populate: false })).toEqual({ logo: m.id, featured: [p.id] })
  })

  it('findById and findOne populate too', async () => {
    const { a, p } = ids
    expect(await cms.findById('posts', p.id)).toMatchObject({ author: { id: a.id, name: 'Ann' } })
    expect(await cms.findOne('posts', { where: { title: 'Hi' } })).toMatchObject({ author: { id: a.id, name: 'Ann' } })
  })
})

describe('populate over HTTP', () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>
  let ids: Awaited<ReturnType<typeof seed>>
  beforeEach(async () => {
    r = setup(relational())
    ids = await seed(r.cms)
  })
  const get = async (path: string) => {
    const res = await r.cms.fetch(new Request(`${origin}/api/cms${path}`))
    return { status: res.status, body: await res.json().catch(() => null) }
  }

  it('resolves relations by default', async () => {
    expect((await get('/collections/posts')).body[0].author.name).toBe('Ann')
  })

  it('reads populate and depth from the query', async () => {
    const { a, m, p } = ids
    expect((await get('/collections/posts?populate=false')).body[0].author).toBe(a.id)
    expect((await get('/collections/posts?depth=1')).body[0].author.avatar).toBe(m.id)
    for (const q of ['seo.image', 'seo']) {
      const post = (await get(`/collections/posts?populate=${q}`)).body[0]
      expect(post.seo.image.url).toBe('/a.png')
      expect(post.author).toBe(a.id)
    }
    expect((await get(`/collections/authors/${a.id}?populate=posts`)).body.posts[0].id).toBe(p.id)
    await r.cms.setGlobal('site', { logo: m.id })
    expect((await get('/globals/site?populate=false')).body).toEqual({ logo: m.id })
    expect((await get('/collections/posts?populate=false&title=Hi')).body).toHaveLength(1)
    expect((await get('/collections/posts?populate=false&title=No')).body).toHaveLength(0)
  })

  it('populates through the client', async () => {
    const { client } = r
    const { a, m, p } = ids
    expect((await client.find('posts', { populate: { author: { avatar: true } } }))[0].author?.avatar?.url).toBe('/a.png')
    expect((await client.findById('posts', p.id, { populate: false })).author).toBe(a.id)
    expect((await client.find('posts', { populate: {} }))[0].author).toBe(a.id)
    expect((await client.findOne('posts', { where: { title: 'Hi' }, populate: false }))?.author).toBe(a.id)
    await r.cms.setGlobal('site', { logo: m.id })
    expect((await client.getGlobal('site', { depth: 0 })).logo).toBe(m.id)
    expect((await client.getGlobal('site')).logo?.url).toBe('/a.png')
  })

  it('types client reads', () => {
    ;async () => {
      const { client } = r
      const c = (await client.find('posts'))[0]
      const n: string = c.author!.name
      // @ts-expect-error unknown populate key
      client.find('posts', { populate: { autor: true } })
      const ids = await client.findById('posts', 'x', { populate: false })
      const aid: string | null | undefined = ids.author
      const j = await client.findById('authors', 'x', { populate: { posts: true } })
      const t: string = j.posts[0].title
    }
  })

  it.each(['?depth=6', '?populate=title', '?populate=nope', '?populate=author.posts.author.posts.author.posts'])('rejects %s', async (q) => {
    expect((await get(`/collections/posts${q}`)).status).toBe(400)
    expect((await get(`/collections/posts/${ids.p.id}${q}`)).status).toBe(400)
  })
})

describe('onDelete', () => {
  let cms: ReturnType<typeof relational>
  let ids: Awaited<ReturnType<typeof seed>>
  beforeEach(async () => {
    cms = relational()
    ids = await seed(cms)
  })
  const ids0 = { populate: false } as const

  it('set-null clears single, many, grouped and global references', async () => {
    const { m, a, p, t1, t2 } = ids
    await cms.setGlobal('site', { logo: m.id, featured: [p.id] })
    await cms.delete('media', m.id)
    expect((await cms.findById('posts', p.id, ids0))?.seo).toEqual({ image: null })
    expect((await cms.findById('authors', a.id, ids0))?.avatar).toBeNull()
    expect((await cms.getGlobal('site', ids0)).logo).toBeNull()
    await cms.delete('tags', t1.id)
    expect((await cms.findById('posts', p.id, ids0))?.tags).toEqual([t2.id])
  })

  it('set-null clears several fields of one document', async () => {
    const cms = defineCms({
      collections: {
        a: { fields: {} },
        b: { fields: { x: { type: 'relation', collection: 'a' }, y: { type: 'relation', collection: 'a', many: true } } },
      },
      database: { url: ':memory:' },
      secret: '',
    })
    const a = await cms.create('a', {})
    const b = await cms.create('b', { x: a.id, y: [a.id] })
    await cms.delete('a', a.id)
    expect(await cms.findById('b', b.id, { populate: false })).toMatchObject({ x: null, y: [] })
  })

  it('set-null updates updatedAt', async () => {
    const { t1, p } = ids
    await new Promise((resolve) => setTimeout(resolve, 5))
    await cms.delete('tags', t1.id)
    expect((await cms.findById('posts', p.id))?.updatedAt).not.toBe(p.updatedAt)
  })
})

describe('onDelete restrict', () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>
  let ids: Awaited<ReturnType<typeof seed>>
  beforeEach(async () => {
    r = setup(relational())
    ids = await seed(r.cms)
  })

  it('blocks the delete and changes nothing', async () => {
    const { cms, client } = r
    const { p } = ids
    const pin = await cms.create('pages', { title: 'p' })
    const note = await cms.create('notes', { post: p.id, pin: pin.id })
    await cms.setGlobal('site', { featured: [p.id] })
    await client.signUp(admin)
    const error = await client.delete('posts', p.id).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CmsError)
    expect(error).toMatchObject({ status: 409, body: { references: [{ collection: 'notes', id: note.id }] } })
    expect(await cms.findById('posts', p.id)).toBeDefined()
    expect((await cms.getGlobal('site', { populate: false })).featured).toEqual([p.id])
  })

  it('throws ConflictError locally', async () => {
    const pin = await r.cms.create('pages', { title: 'p' })
    const note = await r.cms.create('notes', { post: ids.p.id, pin: pin.id })
    const error = await r.cms.delete('posts', ids.p.id).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConflictError)
    expect(error).toMatchObject({ references: [{ collection: 'notes', id: note.id }] })
  })

  it('applies explicit restrict and lists globals', async () => {
    const cms = defineCms({
      collections: {
        posts: { fields: {} },
        notes: { fields: { post: { type: 'relation', collection: 'posts', onDelete: 'restrict' } } },
      },
      globals: { g: { fields: { pin: { type: 'relation', collection: 'posts', onDelete: 'restrict' } } } },
      database: { url: ':memory:' },
      secret: '',
    })
    const p = await cms.create('posts', {})
    const note = await cms.create('notes', { post: p.id })
    await cms.setGlobal('g', { pin: p.id })
    await expect(cms.delete('posts', p.id)).rejects.toMatchObject({ references: [{ collection: 'notes', id: note.id }, { global: 'g' }] })
  })
})

describe('onDelete cascade', () => {
  let cms: ReturnType<typeof relational>
  beforeEach(() => {
    cms = relational()
  })
  const tree = async () => {
    const root = await cms.create('pages', { title: 'root' })
    const child = await cms.create('pages', { title: 'child', parent: root.id })
    const grandchild = await cms.create('pages', { title: 'grandchild', parent: child.id })
    return [root, child, grandchild]
  }

  it('deletes recursively', async () => {
    const [root] = await tree()
    await cms.delete('pages', root.id)
    expect(await cms.find('pages')).toEqual([])
  })

  it('ends cycles', async () => {
    const x = await cms.create('pages', { title: 'x' })
    const y = await cms.create('pages', { title: 'y', parent: x.id })
    await cms.update('pages', x.id, { title: 'x', parent: y.id })
    await cms.delete('pages', x.id)
    expect(await cms.find('pages')).toEqual([])
  })

  it('applies the rules of deleted documents', async () => {
    const [root, child] = await tree()
    const { p } = await seed(cms)
    await cms.create('notes', { post: p.id, pin: child.id })
    await expect(cms.delete('pages', root.id)).rejects.toBeInstanceOf(ConflictError)
    expect(await cms.find('pages')).toHaveLength(3)
  })
})

describe('hooks', () => {
  let calls: string[]
  beforeEach(() => {
    calls = []
  })
  const log = (name: string) => () => void calls.push(name)
  const db = { database: { url: ':memory:' }, secret: 'x'.repeat(32) }
  const title = { title: { type: 'text', required: true } } as const
  const writeStages = ['beforeOperation', 'beforeValidate', 'beforeChange', 'afterChange', 'afterRead', 'afterOperation'] as const
  const logAll = (stages: readonly string[]) => Object.fromEntries(stages.map((s) => [s, [log(s)]]))

  it('run in order on create and update', async () => {
    const cms = defineCms({ ...db, collections: { posts: { fields: title, hooks: logAll(writeStages) } } })
    const post = await cms.create('posts', { title: 'a' })
    await cms.update('posts', post.id, { title: 'b' })
    expect(calls).toEqual([...writeStages, ...writeStages])
  })

  it('accept arrays and records in key order', async () => {
    const make = (beforeChange: (() => void)[] | Record<string, () => void>) => defineCms({ ...db, collections: { posts: { fields: title, hooks: { beforeChange } } } })
    await make({ b: log('b'), a: log('a') }).create('posts', { title: 'x' })
    await make([log('b'), log('a')]).create('posts', { title: 'x' })
    expect(calls).toEqual(['b', 'a', 'b', 'a'])
  })

  it('use a returned value and keep the input on undefined', async () => {
    const posts = defineCollection({
      fields: title,
      hooks: {
        beforeValidate: [({ data }) => ({ ...data, title: data.title?.trim() }), () => undefined],
        afterChange: [({ doc }) => ({ ...doc, extra: 1 })],
        afterOperation: [({ result }) => ({ ...(result as object), op: 1 })],
      },
    })
    const cms = defineCms({ ...db, collections: { posts } })
    const post = await cms.create('posts', { title: '  Hi  ' })
    expect(post).toMatchObject({ title: 'Hi', extra: 1, op: 1 })
    const stored = await cms.findById('posts', post.id)
    expect(stored?.title).toBe('Hi')
    expect(stored).not.toHaveProperty('extra')
  })

  it('pass operation, id and originalDoc', async () => {
    const seen: Record<string, unknown>[] = []
    const posts = defineCollection({
      fields: title,
      hooks: {
        beforeChange: [({ operation, id, originalDoc, data }) => void seen.push({ operation, id, original: originalDoc?.title, data: data.title })],
        afterChange: [({ operation, previousDoc, doc }) => void seen.push({ operation, previous: previousDoc?.title, doc: doc.title })],
      },
    })
    const cms = defineCms({ ...db, collections: { posts } })
    const post = await cms.create('posts', { title: 'a' })
    await cms.update('posts', post.id, { title: 'b' })
    expect(seen).toEqual([
      { operation: 'create', id: undefined, original: undefined, data: 'a' },
      { operation: 'create', previous: undefined, doc: 'a' },
      { operation: 'update', id: post.id, original: 'a', data: 'b' },
      { operation: 'update', previous: 'a', doc: 'b' },
    ])
  })

  it('validate the beforeChange result', async () => {
    const cms = defineCms({ ...db, collections: { posts: { fields: title, hooks: { beforeChange: [({ data }) => ({ ...data, title: '' })] } } } })
    const { client } = setup(cms)
    await client.signUp(admin)
    const error = await client.create('posts', { title: 'a' }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 400, body: { errors: { title: expect.any(String) } } })
    expect(await cms.find('posts')).toEqual([])
  })

  it('run in order on reads', async () => {
    const stages = ['beforeOperation', 'beforeRead', 'afterRead', 'afterOperation']
    const cms = defineCms({ ...db, collections: { posts: { fields: title, hooks: logAll(stages) } } })
    const post = await cms.create('posts', { title: 'a' })
    calls = []
    await cms.find('posts')
    await cms.findOne('posts', { where: { title: 'a' } })
    await cms.findById('posts', post.id)
    expect(calls).toEqual([...stages, ...stages, ...stages])
  })

  it('run afterRead once per find with all docs', async () => {
    const counts: number[] = []
    const posts = defineCollection({
      fields: title,
      hooks: {
        afterRead: [
          ({ docs, operation }) => {
            if (operation === 'read') counts.push(docs.length)
            return docs.map((d) => ({ ...d, title: d.title.toUpperCase() }))
          },
        ],
      },
    })
    const cms = defineCms({ ...db, collections: { posts } })
    for (const t of ['a', 'b', 'c']) await cms.create('posts', { title: t })
    expect((await cms.find('posts')).map((p) => p.title)).toEqual(['C', 'B', 'A'])
    expect(counts).toEqual([3])
  })

  it('run in order on delete', async () => {
    const seen: unknown[] = []
    const record = ({ id, doc }: { id: string; doc: { title: string } }) => void seen.push([id, doc.title])
    const hooks = { ...logAll(['beforeOperation', 'afterOperation']), beforeDelete: [log('beforeDelete'), record], afterDelete: [log('afterDelete'), record] }
    const cms = defineCms({ ...db, collections: { posts: { fields: title, hooks } } })
    const post = await cms.create('posts', { title: 'a' })
    calls = []
    await cms.delete('posts', post.id)
    expect(calls).toEqual(['beforeOperation', 'beforeDelete', 'afterDelete', 'afterOperation'])
    expect(seen).toEqual([
      [post.id, 'a'],
      [post.id, 'a'],
    ])
    calls = []
    await cms.delete('posts', 'missing')
    expect(calls).toEqual(['beforeOperation', 'afterOperation'])
  })

  it('run field hooks before collection hooks, depth-first into groups', async () => {
    const fieldStages = ['beforeValidate', 'beforeChange', 'afterChange', 'afterRead'] as const
    const fieldLog = Object.fromEntries(fieldStages.map((stage) => [stage, [({ path }: { path: string }) => void calls.push(`${path}:${stage}`)]]))
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          fields: { title: { type: 'text', hooks: fieldLog }, seo: { type: 'group', hooks: fieldLog, fields: { title: { type: 'text', hooks: fieldLog } } } },
          hooks: logAll(writeStages),
        },
      },
    })
    await cms.create('posts', { title: 'a', seo: { title: 'b' } })
    expect(calls).toEqual([
      'beforeOperation',
      ...fieldStages.flatMap((stage) => ['title', 'seo', 'seo.title'].map((path) => `${path}:${stage}`).concat(stage)),
      'afterOperation',
    ])
  })

  it('give field hooks value, siblingData and path', async () => {
    const seen: unknown[] = []
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          fields: {
            title: { type: 'text' },
            seo: {
              type: 'group',
              fields: {
                title: {
                  type: 'text',
                  hooks: {
                    beforeChange: [
                      ({ value, siblingData, data, path }) => {
                        seen.push(path, { ...siblingData })
                        return value ?? (data.title as string)
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    })
    const post = await cms.create('posts', { title: 'A', seo: {} })
    expect(post.seo?.title).toBe('A')
    expect(seen).toEqual(['seo.title', {}])
  })

  it('run field afterRead once per value', async () => {
    let count = 0
    const cms = defineCms({
      ...db,
      collections: { posts: { fields: { title: { type: 'text', hooks: { afterRead: [() => void count++, ({ value }) => value?.toUpperCase()] } } } } },
    })
    for (const t of ['a', 'b', 'c']) await cms.create('posts', { title: t })
    count = 0
    expect((await cms.find('posts')).map((p) => p.title)).toEqual(['C', 'B', 'A'])
    expect(count).toBe(3)
  })

  it('are not sent in /schema', async () => {
    const cms = defineCms({
      ...db,
      collections: { posts: { fields: { title: { type: 'text', hooks: { afterRead: [log('f')] } }, hooks: { type: 'text' } }, hooks: { beforeChange: [log('a')], afterRead: { b: log('b') } } } },
      globals: { site: { fields: {}, hooks: { afterRead: [log('g')] } } },
    })
    const { client } = setup(cms)
    await client.signUp(admin)
    const schema = await client.getSchema()
    expect(schema.collections?.posts.fields.hooks).toEqual({ type: 'text' })
    expect(JSON.stringify(schema).replace('"hooks":{"type":"text"}', '')).not.toContain('hooks')
  })
})

describe('transactions', () => {
  const db = { database: { url: ':memory:' }, secret: 'x'.repeat(32) }
  const logs = { fields: { message: { type: 'text' } } } as const

  it('roll back the write and nested writes', async () => {
    const cms = defineCms({
      ...db,
      collections: {
        logs,
        posts: {
          fields: { title: { type: 'text' } },
          hooks: {
            afterChange: [
              async ({ cms }) => {
                await cms.create('logs', { message: 'x' })
                throw new Error('boom')
              },
            ],
          },
        },
      },
    })
    await expect(cms.create('posts', { title: 'a' })).rejects.toThrow('boom')
    expect(await cms.find('posts')).toEqual([])
    expect(await cms.find('logs')).toEqual([])
  })

  it("nested calls run on the write's transaction", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        logs,
        posts: {
          fields: { title: { type: 'text' }, log: { type: 'text' } },
          hooks: {
            beforeChange: [
              async ({ cms, data }) => {
                await cms.find('logs')
                return { ...data, log: (await cms.create('logs', { message: 'x' })).id }
              },
            ],
            afterChange: [async ({ cms, doc }) => void (await cms.findById('logs', doc.log))],
          },
        },
      },
    })
    await cms.create('posts', { title: 'a' })
    expect(await cms.find('logs')).toHaveLength(1)
  })
})
