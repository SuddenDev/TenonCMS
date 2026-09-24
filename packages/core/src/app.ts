import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { API_BASE } from './client.ts'
import type { Cms } from './index.ts'
import { ConflictError } from './errors.ts'
import { HttpError, parsePopulate } from './relations.ts'
import { dataSchema, filterable, type Schema, type Fields } from './schema.ts'

export function createApp(cms: Cms<Schema>) {
  const { schema } = cms
  const validators = {
    collections: mapValues(schema.collections, (c) => dataSchema(c.fields)),
    globals: mapValues(schema.globals, (g) => dataSchema(g.fields)),
  }

  const api = new Hono().basePath(API_BASE)
  api.onError((err, c) => {
    if (err instanceof HttpError) return c.json(err.body, err.status)
    if (err instanceof ConflictError) return c.json({ error: [{ path: [], message: err.message }], references: err.references }, 409)
    if (err instanceof HTTPException) return err.getResponse()
    console.error(err)
    return c.text('Internal Server Error', 500)
  })

  api.on(['GET', 'POST'], '/auth/*', async (c) => (await cms.auth()).handler(c.req.raw))

  // Reads are public: the site renders this content anyway. Query params are equality filters,
  // except `limit`, `populate` and `depth`, so fields with these names cannot be filtered over HTTP.
  api.get('/collections/:name', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const { limit, populate, depth, ...query } = c.req.query()
    const fields = schema.collections![name].fields
    const where = whereFromQuery(fields, query)
    if (!where) return c.json({ error: 'Invalid filter' }, 400)
    if (limit !== undefined && !/^[1-9]\d*$/.test(limit)) return c.json({ error: 'Invalid limit' }, 400)
    const read = readOptions(fields, { populate, depth })
    if (!read) return c.json({ error: 'Invalid populate' }, 400)
    return c.json(await cms.find(name, { where, limit: limit ? Number(limit) : undefined, ...read }))
  })

  api.get('/collections/:name/:id', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const read = readOptions(schema.collections![name].fields, c.req.query())
    if (!read) return c.json({ error: 'Invalid populate' }, 400)
    const doc = await cms.findById(name, c.req.param('id'), read)
    return doc ? c.json(doc) : c.notFound()
  })

  api.get('/globals/:name', async (c) => {
    const name = globalName(c.req.param('name'))
    if (!name) return c.notFound()
    const read = readOptions(schema.globals![name].fields, c.req.query())
    if (!read) return c.json({ error: 'Invalid populate' }, 400)
    return c.json(await cms.getGlobal(name, read))
  })

  api.use(csrf())
  api.use(async (c, next) => {
    const session = await (await cms.auth()).api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    await next()
  })

  api.get('/schema', (c) => c.json(schema))

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

  function readOptions(fields: Fields, query: { populate?: string; depth?: string }): { populate?: boolean | Record<string, unknown>; depth?: number } | undefined {
    const spec = parsePopulate(schema.collections ?? {}, fields, query, cms.populate)
    if (spec === undefined) return undefined
    return spec === false ? { populate: false } : typeof spec === 'number' ? { depth: spec } : { populate: spec }
  }
  function collectionName(name: string) {
    return Object.hasOwn(schema.collections ?? {}, name) ? name : undefined
  }
  function globalName(name: string) {
    return Object.hasOwn(schema.globals ?? {}, name) ? name : undefined
  }
}

function mapValues<T, R>(record: Record<string, T> | undefined, fn: (value: T) => R) {
  return Object.fromEntries(Object.entries(record ?? {}).map(([key, value]) => [key, fn(value)]))
}

// Coerces query strings to the field's type, so `?featured=true` matches a boolean column.
// `null` matches an empty or missing field, like `null` in the local API. An empty value adds no filter.
// Returns `undefined` for an unknown field or a value that does not fit its type.
function whereFromQuery(fields: Fields, query: Record<string, string>) {
  const where: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(query)) {
    if (!filterable(fields, key)) return undefined
    if (value === '') continue
    if (value === 'null') {
      where[key] = null
      continue
    }
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
