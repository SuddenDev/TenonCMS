import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient as createLibsql } from '@libsql/client'
import { createAuthMiddleware } from 'better-auth/api'
import { admin as adminPlugin, twoFactor } from 'better-auth/plugins'
import { beforeEach, describe, expect, it } from 'vitest'
import { CmsError, createClient } from './client.ts'
import { defineCms, type Schema } from './index.ts'

const origin = 'http://localhost'
const base = {
  collections: {
    posts: {
      fields: {
        title: { type: 'text', required: true },
        views: { type: 'number' },
        featured: { type: 'boolean' },
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
    const { client, fetch } = setup(defineCms({ ...base, auth: { plugins: [adminPlugin({ defaultRole: 'admin' })] } }))
    await client.signUp(admin)
    const res = await fetch(`${origin}/api/cms/auth/admin/create-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'c@d.co', password: 'password123', name: 'C' }),
    })
    expect(res.status).toBe(200)
    expect(await status(client.signUp({ ...admin, email: 'e@f.co' }))).toBe(403)
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

  it('set a global', async () => {
    await client.signUp(admin)
    expect(await client.getGlobal('site')).toEqual({})
    await client.setGlobal('site', { name: 'Site' })
    expect(await client.getGlobal('site')).toEqual({ name: 'Site' })
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

  it('ignore undefined filters', async () => {
    expect(await client.find('posts', { where: { views: undefined } })).toHaveLength(3)
  })

  it('limit results', async () => {
    expect(await client.find('posts', { limit: 2 })).toHaveLength(2)
    expect(await client.findOne('posts', { where: { views: 2 } })).toMatchObject({ title: 'C' })
  })

  it.each(['?nope=1', '?limit=0', '?limit=-1', '?limit=abc'])('reject %s', async (query) => {
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
