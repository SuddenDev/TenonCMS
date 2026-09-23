import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { API_BASE } from './auth.ts'
import type { Cms } from './index.ts'
import { dataSchema, type Config, type Fields } from './schema.ts'

export function createApp(cms: Cms<Config>) {
  const { config } = cms
  const app = new Hono()

  const api = new Hono<{ Variables: { userId: string } }>()

  api.on(['GET', 'POST'], '/auth/*', async (c) => (await cms.auth()).handler(c.req.raw))

  // Reads are public: the site renders this content anyway. Query params are equality filters.
  api.get('/collections/:name', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const where = whereFromQuery(config.collections![name].fields, c.req.query())
    if (!where) return c.json({ error: 'Unknown field' }, 400)
    return c.json(await cms.find(name, { where }))
  })

  api.get('/collections/:name/:id', async (c) => {
    const name = collectionName(c.req.param('name'))
    const doc = name && (await cms.findById(name, c.req.param('id')))
    return doc ? c.json(doc) : c.notFound()
  })

  api.get('/globals/:name', async (c) => {
    const name = globalName(c.req.param('name'))
    if (!name) return c.notFound()
    return c.json(await cms.getGlobal(name))
  })

  api.use(csrf())
  api.use(async (c, next) => {
    const session = await (await cms.auth()).api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    c.set('userId', session.user.id)
    await next()
  })

  api.get('/schema', (c) => c.json(config))

  api.post('/collections/:name', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const parsed = dataSchema(config.collections![name].fields).safeParse(await c.req.json())
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
    return c.json(await cms.create(name, parsed.data), 201)
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

// Coerces query strings to the field's type, so `?featured=true` matches a boolean column.
function whereFromQuery(fields: Fields, query: Record<string, string>) {
  const where: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(query)) {
    if (!Object.hasOwn(fields, key)) return undefined
    const type = fields[key].type
    where[key] = type === 'number' ? Number(value) : type === 'boolean' ? value === 'true' : value
  }
  return where
}
