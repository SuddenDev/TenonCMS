import type { User } from 'better-auth'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { API_BASE } from './client.ts'
import { isObject } from './condition.ts'
import type { Cms } from './index.ts'
import { ConflictError, ValidationError } from './errors.ts'
import { parsePopulate } from './relations.ts'
import { type Field, type Fields, filterable, type Schema } from './schema.ts'

/** `asUser(user)` returns the local API with the session user set for hooks. */
export function createApp(cms: Cms<Schema>, asUser: (user: User) => Cms<Schema>) {
  const { schema } = cms
  const collections = schema.collections ?? {}
  // Hooks are functions. `JSON.stringify` turns them into `null` inside arrays, so they are dropped here.
  // A field MAY be named `hooks`; it has a `type`. `JSON.stringify` drops other functions, like `validate`, itself.
  const publicSchema = JSON.parse(JSON.stringify(schema, (key, value) => (key === 'hooks' && typeof value?.type !== 'string' ? undefined : value)))

  // Removes fields the caller cannot see, also in groups, populated relations and joins.
  function strip(fields: Fields, doc: unknown, level: Level): unknown {
    if (Array.isArray(doc)) return doc.map((d) => strip(fields, d, level))
    if (!isObject(doc)) return doc
    const out = { ...doc }
    for (const [key, f] of Object.entries(fields)) {
      if (!visible(f, level)) delete out[key]
      else if (f.type === 'group') out[key] = strip(f.fields, out[key], level)
      else if (f.type === 'relation' || f.type === 'join') out[key] = strip(collections[f.collection].fields, out[key], level)
    }
    return out
  }

  // Reads are public. Only a request with a cookie MAY see private fields, so others cost no session lookup.
  // A failed lookup, e.g. with a bad `secret`, counts as no session.
  async function readLevel(request: Request): Promise<Level> {
    if (!request.headers.get('cookie')) return 'public'
    const session = await cms
      .auth()
      .then((auth) => auth.api.getSession({ headers: request.headers }))
      .catch(() => null)
    return session ? 'admin' : 'public'
  }

  // Reads use `cms` (no user). Writes use `c.var.cms`, which carries the session user.
  const api = new Hono<{ Variables: { cms: Cms<Schema> } }>().basePath(API_BASE)
  // Every error body has `message`, like better-auth's. Only expected errors send their own; others MAY hold internals.
  api.onError((err, c) => {
    if (err instanceof ValidationError) return c.json({ message: err.message, errors: err.errors }, 400)
    if (err instanceof ConflictError) return c.json({ message: err.message, references: err.references }, 409)
    if (err instanceof HTTPException) return c.json({ message: err.message }, err.status)
    console.error(err)
    return c.json({ message: 'Internal Server Error' }, 500)
  })
  api.notFound((c) => c.json({ message: 'Not Found' }, 404))

  api.on(['GET', 'POST'], '/auth/*', async (c) => (await cms.auth()).handler(c.req.raw))

  // Reads are public: the site renders this content anyway. Query params are equality filters,
  // except `limit`, `populate` and `depth`, so fields with these names cannot be filtered over HTTP.
  api.get('/collections/:name', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const { limit, populate, depth, ...query } = c.req.query()
    const fields = schema.collections![name].fields
    const level = await readLevel(c.req.raw)
    const where = whereFromQuery(fields, query, level)
    if (!where) return c.json({ message: 'Invalid filter' }, 400)
    if (limit !== undefined && !/^[1-9]\d*$/.test(limit)) return c.json({ message: 'Invalid limit' }, 400)
    const read = readOptions(fields, { populate, depth })
    if (typeof read === 'string') return c.json({ message: read }, 400)
    return c.json(strip(fields, await cms.find(name, { where, limit: limit ? Number(limit) : undefined, ...read }), level))
  })

  api.get('/collections/:name/:id', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const fields = schema.collections![name].fields
    const read = readOptions(fields, c.req.query())
    if (typeof read === 'string') return c.json({ message: read }, 400)
    const doc = await cms.findById(name, c.req.param('id'), read)
    return doc ? c.json(strip(fields, doc, await readLevel(c.req.raw))) : c.notFound()
  })

  api.get('/globals/:name', async (c) => {
    const name = globalName(c.req.param('name'))
    if (!name) return c.notFound()
    const fields = schema.globals![name].fields
    const read = readOptions(fields, c.req.query())
    if (typeof read === 'string') return c.json({ message: read }, 400)
    return c.json(strip(fields, await cms.getGlobal(name, read), await readLevel(c.req.raw)))
  })

  api.use(csrf())
  api.use(async (c, next) => {
    const session = await (await cms.auth()).api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.json({ message: 'Unauthorized' }, 401)
    c.set('cms', asUser(session.user))
    await next()
  })

  api.get('/schema', (c) => c.json(publicSchema))

  api.post('/collections/:name', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    return c.json(await c.var.cms.create(name, await body(c.req)), 201)
  })

  api.put('/collections/:name/:id', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    const doc = await c.var.cms.update(name, c.req.param('id'), await body(c.req))
    return doc ? c.json(doc) : c.notFound()
  })

  api.delete('/collections/:name/:id', async (c) => {
    const name = collectionName(c.req.param('name'))
    if (!name) return c.notFound()
    await c.var.cms.delete(name, c.req.param('id'))
    return c.body(null, 204)
  })

  api.put('/globals/:name', async (c) => {
    const name = globalName(c.req.param('name'))
    if (!name) return c.notFound()
    return c.json(await c.var.cms.setGlobal(name, await body(c.req)))
  })

  return api

  // The read options, or the message of a 400.
  function readOptions(fields: Fields, query: { populate?: string; depth?: string }): { populate?: boolean | Record<string, unknown>; depth?: number } | string {
    const spec = parsePopulate(schema.collections ?? {}, fields, query, cms.populate)
    if (typeof spec === 'string') return spec
    return spec === false ? { populate: false } : typeof spec === 'number' ? { depth: spec } : { populate: spec }
  }
  function collectionName(name: string) {
    return Object.hasOwn(schema.collections ?? {}, name) ? name : undefined
  }
  function globalName(name: string) {
    return Object.hasOwn(schema.globals ?? {}, name) ? name : undefined
  }
}

/** `public`: a read without a session. `admin`: a request with a session. */
type Level = 'public' | 'admin'
const visible = (f: Field, level: Level) => level === 'admin' || !f.private

// A malformed body reads as `undefined`, which fails validation with 400.
const body = (req: { json(): Promise<any> }) => req.json().catch(() => undefined)

// Coerces query strings to the field's type, so `?featured=true` matches a boolean column.
// `null` matches an empty or missing field, like `null` in the local API. An empty value adds no filter.
// Returns `undefined` for an unknown field, a field the caller cannot see or a value that does not fit its type.
function whereFromQuery(fields: Fields, query: Record<string, string>, level: Level) {
  const where: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(query)) {
    if (!filterable(fields, key) || !visible(fields[key], level)) return undefined
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
