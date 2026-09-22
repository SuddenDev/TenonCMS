import assets from '@integral-cms/admin'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { API_BASE } from './auth.ts'
import type { Cms } from './index.ts'
import { dataSchema, type Config } from './schema.ts'

const ADMIN_BASE = '/admin'

const contentTypes: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
}

let decoded: Map<string, Uint8Array<ArrayBuffer>> | undefined
function adminFile(path: string) {
  decoded ??= new Map(Object.entries(assets).map(([p, b64]) => [p, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]))
  return decoded.get(path)
}

export function createApp(cms: Cms<Config>) {
  const { config } = cms
  const app = new Hono()

  app.get(`${ADMIN_BASE}/*`, (c) => {
    const path = c.req.path.slice(ADMIN_BASE.length)
    const file = adminFile(path)
    if (file) {
      const ext = path.split('.').pop()!
      return c.body(file, 200, {
        'content-type': contentTypes[ext] ?? 'application/octet-stream',
        'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      })
    }
    // SPA fallback: the Vue router handles the path.
    return c.body(adminFile('/index.html')!, 200, { 'content-type': contentTypes.html, 'cache-control': 'no-cache' })
  })

  const api = new Hono<{ Variables: { userId: string } }>()

  api.on(['GET', 'POST'], '/auth/*', async (c) => (await cms.auth()).handler(c.req.raw))

  api.use(csrf())
  api.use(async (c, next) => {
    const session = await (await cms.auth()).api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    c.set('userId', session.user.id)
    await next()
  })

  api.get('/schema', (c) => c.json(config))

  api.get('/collections/:name', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    return c.json(await cms.find(name))
  })

  api.post('/collections/:name', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const parsed = dataSchema(config.collections![name].fields).safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
    return c.json(await cms.create(name, parsed.data), 201)
  })

  api.get('/collections/:name/:id', async (c) => {
    const name = collectionName(c.req.param('name'))
    const doc = name && (await cms.findById(name, c.req.param('id')))
    return doc ? c.json(doc) : c.notFound()
  })

  api.put('/collections/:name/:id', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const parsed = dataSchema(config.collections![name].fields).safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
    const doc = await cms.update(name, c.req.param('id'), parsed.data)
    return doc ? c.json(doc) : c.notFound()
  })

  api.delete('/collections/:name/:id', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    await cms.delete(name, c.req.param('id'))
    return c.body(null, 204)
  })

  api.get('/globals/:name', async (c) => {
    const name = globalName(c.req.param('name'))
    if (!name) return c.notFound()
    return c.json(await cms.getGlobal(name))
  })

  api.put('/globals/:name', async (c) => {
    const name = globalName(c.req.param('name'))
    if (!name) return c.notFound()
    const parsed = dataSchema(config.globals![name].fields).safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
    return c.json(await cms.setGlobal(name, parsed.data))
  })

  app.route(API_BASE, api)
  return app

  function collectionName(name: string) {
    return Object.hasOwn(config.collections ?? {}, name) ? name : undefined
  }
  function globalName(name: string) {
    return Object.hasOwn(config.globals ?? {}, name) ? name : undefined
  }
}
