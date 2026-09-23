import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { API_BASE } from './client.ts'
import type { Cms } from './index.ts'
import { dataSchema, type Config, type Fields } from './schema.ts'

export function createApp(cms: Cms<Config>) {
  const { config } = cms
  const validators = {
    collections: mapValues(config.collections, (c) => dataSchema(c.fields)),
    globals: mapValues(config.globals, (g) => dataSchema(g.fields)),
  }

  const api = new Hono().basePath(API_BASE)

  api.on(['GET', 'POST'], '/auth/*', async (c) => (await cms.auth()).handler(c.req.raw))

  // Reads are public: the site renders this content anyway. Query params are equality filters,
  // except `limit`, so a field named `limit` cannot be filtered over HTTP.
  api.get('/collections/:name', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const { limit, ...query } = c.req.query()
    const where = whereFromQuery(config.collections![name].fields, query)
    if (!where) return c.json({ error: 'Invalid filter' }, 400)
    if (limit !== undefined && !/^[1-9]\d*$/.test(limit)) return c.json({ error: 'Invalid limit' }, 400)
    return c.json(await cms.find(name, { where, limit: limit ? Number(limit) : undefined }))
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
    await next()
  })

  api.get('/schema', (c) => c.json(config))

  api.post('/collections/:name', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const parsed = validators.collections[name].safeParse(await c.req.json().catch(() => undefined))
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
    return c.json(await cms.create(name, parsed.data), 201)
  })

  api.put('/collections/:name/:id', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const parsed = validators.collections[name].safeParse(await c.req.json().catch(() => undefined))
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
    const parsed = validators.globals[name].safeParse(await c.req.json().catch(() => undefined))
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
    return c.json(await cms.setGlobal(name, parsed.data))
  })

  return api

  function collectionName(name: string) {
    return Object.hasOwn(config.collections ?? {}, name) ? name : undefined
  }
  function globalName(name: string) {
    return Object.hasOwn(config.globals ?? {}, name) ? name : undefined
  }
}

function mapValues<T, R>(record: Record<string, T> | undefined, fn: (value: T) => R) {
  return Object.fromEntries(Object.entries(record ?? {}).map(([key, value]) => [key, fn(value)]))
}

// Coerces query strings to the field's type, so `?featured=true` matches a boolean column.
// Returns `undefined` for an unknown field or a value that does not fit its type.
function whereFromQuery(fields: Fields, query: Record<string, string>) {
  const where: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(query)) {
    if (!Object.hasOwn(fields, key)) return undefined
    const type = fields[key].type
    if (type === 'number') {
      if (value.trim() === '' || !Number.isFinite(Number(value))) return undefined
      where[key] = Number(value)
    } else if (type === 'boolean') {
      if (value !== 'true' && value !== 'false') return undefined
      where[key] = value === 'true'
    } else {
      where[key] = value
    }
  }
  return where
}
