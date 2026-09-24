import { type Kysely, sql } from 'kysely'
import { type Database, type Row, toDoc } from './db/index.ts'
import type { Collection, Field, Fields, Schema } from './schema.ts'

export type RelationField = Extract<Field, { type: 'relation' }>

/** Every `relation` at the top level and inside groups, with its key path. */
export function relationPaths(fields: Fields, prefix: string[] = []): { path: string[]; field: RelationField }[] {
  return Object.entries(fields).flatMap(([key, f]) =>
    f.type === 'relation' ? [{ path: [...prefix, key], field: f }] : f.type === 'group' ? relationPaths(f.fields, [...prefix, key]) : [],
  )
}

function hasJoin(fields: Fields): boolean {
  return Object.values(fields).some((f) => f.type === 'join' || (f.type === 'group' && hasJoin(f.fields)))
}

/** Throws when a relation or join does not fit the schema. */
export function checkSchema(schema: Schema, populate: { depth: number; maxDepth: number }) {
  const collections = schema.collections ?? {}
  const fail = (message: string) => {
    throw new Error(`integral-cms: ${message}`)
  }
  if (populate.depth > populate.maxDepth) fail(`populate.depth (${populate.depth}) is above populate.maxDepth (${populate.maxDepth})`)
  const owners = [
    ...Object.entries(collections).map(([name, c]) => ({ name, fields: c.fields, global: false })),
    ...Object.entries(schema.globals ?? {}).map(([name, g]) => ({ name, fields: g.fields, global: true })),
  ]
  for (const { name, fields, global } of owners) {
    for (const { path, field } of relationPaths(fields)) {
      const at = `relation "${name}.${path.join('.')}"`
      if (!Object.hasOwn(collections, field.collection)) fail(`${at} targets unknown collection "${field.collection}"`)
      if (field.required && field.onDelete === 'set-null') fail(`${at} is required and cannot use onDelete: 'set-null'`)
      if (global && field.onDelete === 'cascade') fail(`${at} is in a global and cannot use onDelete: 'cascade'`)
    }
    for (const [key, f] of Object.entries(fields)) {
      if (f.type === 'group' && hasJoin(f.fields)) fail(`join inside group "${name}.${key}"`)
      if (f.type !== 'join') continue
      if (global) fail(`join "${name}.${key}" in a global`)
      const source = Object.hasOwn(collections, f.collection) ? collections[f.collection].fields : undefined
      const target = source && relationPaths(source).find((r) => r.path.join('.') === f.on)
      if (target?.field.collection !== name) fail(`join "${name}.${key}" needs "${f.on}" to be a relation to "${name}" in "${f.collection}"`)
    }
  }
}

/** Thrown by the local API for invalid input. HTTP returns `status` with `body`. */
export class HttpError extends Error {
  constructor(
    public status: 400,
    public body: object,
  ) {
    super(JSON.stringify(body))
  }
}

function at(data: any, path: string[]): any {
  return path.reduce((o, k) => o?.[k], data)
}

/** Every id MUST exist in its target collection. One query per relation field. */
export async function checkRefs(
  q: Kysely<Database>,
  fields: Fields,
  data: Record<string, unknown>,
  self?: { collection: string; id: string },
) {
  for (const { path, field } of relationPaths(fields)) {
    const value = at(data, path)
    const ids: string[] = value == null ? [] : field.many ? value : [value]
    const fail = (message: string) => {
      throw new HttpError(400, { error: [{ path, message }] })
    }
    if (self && field.collection === self.collection && ids.includes(self.id)) fail('A document cannot reference itself')
    if (!ids.length) continue
    const found = await q
      .selectFrom('cms_documents')
      .select('id')
      .where('collection', '=', field.collection)
      .where(sql<boolean>`id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`)
      .execute()
    if (found.length !== new Set(ids).size) fail(`Unknown id in "${field.collection}"`)
  }
}

/** `false`: ids. Number: hops left. Object: listed paths only; `true` inside means one hop. */
export type Spec = false | number | { [key: string]: true | Spec }

/** Resolves relation ids in `docs` in place. One query per relation or join field per hop. */
export async function populate(
  q: Kysely<Database>,
  collections: Record<string, Collection>,
  fields: Fields,
  docs: Record<string, any>[],
  spec: Spec | true,
) {
  if (!spec || !docs.length) return
  for (const [key, field] of Object.entries(fields)) {
    const sub = typeof spec === 'object' ? spec[key] : spec
    if (!sub) continue
    if (field.type === 'group') {
      await populate(q, collections, field.fields, docs.map((d) => d[key]).filter(Boolean), sub === true ? 1 : sub)
      continue
    }
    if (field.type !== 'relation' && field.type !== 'join') continue
    // Joins resolve only when named in a populate object.
    if (field.type === 'join' && typeof spec !== 'object') continue
    const next = sub === true ? false : typeof sub === 'number' ? sub - 1 : sub
    const target = collections[field.collection].fields
    if (field.type === 'join') {
      const source = relationPaths(target).find((r) => r.path.join('.') === field.on)!.field
      const path = `$.${field.on}`
      const ids = JSON.stringify(docs.map((d) => d.id))
      const query = source.many
        ? sql<Row & { ref: string }>`SELECT d.*, j.value AS ref FROM cms_documents d, json_each(d.data, ${path}) j
            WHERE d.collection = ${field.collection} AND j.value IN (SELECT value FROM json_each(${ids}))
            ORDER BY d.created_at DESC, d.rowid DESC`
        : sql<Row & { ref: string }>`SELECT d.*, json_extract(d.data, ${path}) AS ref FROM cms_documents d
            WHERE d.collection = ${field.collection} AND json_extract(d.data, ${path}) IN (SELECT value FROM json_each(${ids}))
            ORDER BY d.created_at DESC, d.rowid DESC`
      const rows = (await query.execute(q)).rows
      const byId = new Map(rows.map((r) => [r.id, toDoc(r)]))
      await populate(q, collections, target, [...byId.values()], next)
      for (const d of docs) d[key] = rows.filter((r) => r.ref === d.id).map((r) => byId.get(r.id))
      continue
    }
    const found = new Map((await byIds(q, field.collection, [...new Set(docs.flatMap((d) => d[key] ?? []))])).map((d) => [d.id, d]))
    await populate(q, collections, target, [...found.values()], next)
    for (const d of docs) {
      if (d[key] == null) continue
      d[key] = field.many ? d[key].map((id: string) => found.get(id)).filter(Boolean) : (found.get(d[key]) ?? null)
    }
  }
}

async function byIds(q: Kysely<Database>, collection: string, ids: string[]) {
  if (!ids.length) return []
  const rows = await q
    .selectFrom('cms_documents')
    .selectAll()
    .where('collection', '=', collection)
    .where(sql<boolean>`id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`)
    .execute()
  return rows.map(toDoc)
}
