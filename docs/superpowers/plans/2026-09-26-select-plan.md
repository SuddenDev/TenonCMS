# Plan: Select and breadcrumbs

Spec: `docs/superpowers/specs/2026-09-26-select-design.md` (spec 7). Runs on `main` at v0.7.0, which has everything it needs: relations with `populate` (`Spec` in `src/relations.ts`), hooks with `run()` / `read()` / `afterRead()` in `src/index.ts`, the page preset, `private` stripping in `src/app.ts`, and `src/helpers/` with no imports.

Paths are relative to `packages/core` unless noted. Run one test with `npx vitest run <file> -t '<name>'` in `packages/core` (`pnpm ... test -- -t` does not filter). Type tests run with `pnpm --filter integral-cms typecheck` (vitest does not typecheck; an unused `@ts-expect-error` is an error, so a type test is RED when the line compiles). No build is needed for tests.

## Decisions

- **Runtime lives in `src/relations.ts`, next to `populate()`.** Three exports: `SelectSpec` (the runtime type, `{ [key]: true | SelectSpec }`, named like `Spec` so it does not clash with the `Select` type in `schema.ts`), `checkSelect()` and `pick()`, plus `parseSelect()` for HTTP. They need `collections`, `Fields` and `Spec`, which the file already has. Unit tests go into `src/relations.test.ts`, which already holds the collections fixture for `parsePopulate`. The spec named `schema.test.ts`; that file is for `schema.ts`.
- **`checkSelect(collections, fields, select, spec)` returns the offending path or `undefined`.** It walks `select` with the same rules `populate()` uses to decide what is resolved: `sub = typeof spec === 'object' ? spec[key] : spec`, a join only when `spec` is an object, `next = sub === true ? false : typeof sub === 'number' ? sub - 1 : sub`, a group passes `sub === true ? 1 : sub`. The path ends at the key that breaks a rule: `author.nam` for an unknown key, `title` for an object on a plain field, `author` for an object on an unresolved relation. The local API throws `new Error('Invalid select: <path>')` from `read()` and `getGlobal`, like an unknown `where` key. `app.ts` calls it first and answers 400 with the same message. `id`, `createdAt` and `updatedAt` are accepted with `true` at every level; the typed API already rejects them inside groups.
- **HTTP 400 messages name the offending path, for `select` and `populate`.** `parsePopulate()` returns the message instead of `undefined`: `Invalid populate: author.nope` (the path up to the key that fails), `Invalid depth: 3` for a bad `?depth=`. Task 4b makes this change before `select` reaches the routes.
- **`pick(collections, fields, doc, select, meta = true)` never throws.** It copies `id` first when `meta` is set (document levels; groups pass `false`), then each listed key that exists in `doc` (`key in doc`, so a field that was never saved stays missing and a global gets no `id`). `true` or a `null` value copies as is. An object recurses: a group with its fields, a relation or join with the target's fields, an array item by item. A value that is not an object (an unresolved id) is copied unchanged, so `pick` is safe even without `checkSelect`.
- **`?select=` parsing is schema-free.** `parseSelect(query)` splits on `,` and `.` and builds the object the way `parsePopulate()` does: the last segment sets `node[key] ??= true`, an earlier one turns `true` into `{}`. So `seo,seo.title` and `seo.title,seo` both give `{ seo: { title: true } }`: the longer path wins. Empty segments are dropped, so `?select=` (empty) is `{}` and returns only `id`; the client sends that for `select: {}`. Unknown keys are caught by `checkSelect`, which runs in `readOptions()` right after `parsePopulate()`, because the check needs the populate `Spec`.
- **`readOptions()` returns the options or the 400 message as a string.** Today it returns `undefined` for a bad populate. With messages that name a path, the string is the smallest change; the three read routes do `if (typeof read === 'string') return c.json({ message: read }, 400)`.
- **Select runs after `afterRead`, before `afterOperation`.** `read()` returns `afterRead(...)` and `run()` applies `afterOperation` on that. So `read()` and `getGlobal` map the documents through `pick` after `afterRead` when `options.select` is set. `checkSelect` runs at the top of `read()` before the query, so a bad select fails before `beforeRead`.
- **Private stripping needs no change.** `strip()` in `app.ts` runs on the picked response and deletes private keys; on a picked document it also assigns `undefined` to missing groups, which JSON drops. A selected private field is not an error: `checkSelect` does not know the level.
- **The client sends `select` like `populate`.** `readQuery()` adds `select: options.select && paths(options.select).join(',')`. `paths()` treats an empty nested object as the path itself, so `{ parent: {} }` reaches the server as `parent` (= `true`), while the local API returns `{ id }` for it. Accepted, like `populate`; the README says so.
- **Types: `Select<Cs, F, P>` mirrors `Populate`, the result is `Selected<T, S>` applied on top of the existing read type.**
  - `Select<Cs, F, P>` lists every key of `F` (plus `id`, `createdAt`, `updatedAt`) as `true`; a group allows `true | Select<Cs, G, …>`; a relation allows an object only when `Sub<P, K>` resolves it (same test as `Value`: not `false | 0 | undefined`), a join only when named in a populate object (`Joins<F, P>`). The nested `P` is `Next<Sub<P, K>>`, for a group `Sub<P, K> extends true ? 1 : Sub<P, K>`. So "select into an unresolved relation" is a type error because the nested object is not allowed there.
  - `Selected<T, S>` narrows a resolved type structurally, so it needs no second copy of `Value`: `S extends true ? T : T extends (infer U)[] ? Selected<U, S>[] : T extends object ? Simplify<{ [K in keyof T as K extends 'id' | keyof S ? K : never]: K extends keyof S ? Selected<T[K], S[K]> : T[K] }> : T`. It distributes over `| null`, keeps `?` modifiers (key remapping over `keyof T` is homomorphic) and keeps `id` at every object level; a group type has no `id`, so nothing leaks.
  - `Read` and `ReadDoc` get a fourth parameter `S = true` and apply `Selected` inside the existing `Wide` branch, so untyped schemas still read `Record<string, any>` and never instantiate it (TS2589 guard). `SelectOf<O>` reads `O['select']` (an object) or `true`.
  - `Exact` gets one more rule: `[A] extends [never] ? never : …` for an object `P`. Today an object under a key that only allows `true` passes, because `Exclude<true | undefined, true | undefined>` is `never` and `keyof never` accepts every key. With the rule, `select: { parent: { title: true } }` on an unresolved `parent` and `populate: { title: {} }` are rejected. `populate` type tests stay green: their nested `A` types are objects.
  - `ReadOptions` gets `select?: SelectArg<Cs, F, number>` (a number resolves everything, so the constraint accepts any nesting; `Checked` does the exact check). `Checked<O, Cs, F, D extends number = 2>` gets the default depth, because `PopulateOf<O, D>` decides what is resolved when `populate` is not given. `index.ts` passes `D`, `client.ts` passes `Depth<C>`, the Nuxt composable passes `(typeof cms)['populate']['depth']`.
  - `LocalApi`'s `Options` gets `select?: Record<string, unknown>`, so hooks can pass it.
- **`breadcrumbs()` is a loop, no recursion.** `for (let d = doc; d && typeof d === 'object'; d = d[parent]) trail.unshift(...)`. An id, `null` or a missing parent ends it. Exported from `src/helpers/index.ts`, and named in the two re-export lines in `index.ts` and `client.ts`.
- **The Astro page selects `title`, `path`, `body`, `seo` and two parent levels** with `populate: { parent: { parent: true } }`. `seoMeta(page)` still typechecks because `title` and `seo` are selected.

## Tasks

### Task 1: `pick()`

RED
- `src/relations.test.ts`, new `describe('pick')`, using the file's `collections` fixture:

```ts
import { parsePopulate, pick } from './relations.ts'

describe('pick', () => {
  const media = { id: 'm', url: '/a.png', createdAt: 'c', updatedAt: 'u' }
  const post = {
    id: 'p', createdAt: 'c', updatedAt: 'u', title: 'Hi',
    author: { id: 'a', name: 'Ann', avatar: media, createdAt: 'c', updatedAt: 'u', posts: [] },
    tags: [{ id: 't1', name: 'one' }, { id: 't2', name: 'two' }],
    seo: { image: media },
  }
  const p = (select: Record<string, any>, doc: Record<string, any> = post, fields = collections.posts.fields) => pick(collections, fields, doc, select)

  it('keeps id and the listed fields', () => {
    expect(p({ title: true })).toEqual({ id: 'p', title: 'Hi' })
    expect(p({})).toEqual({ id: 'p' })
    expect(p({ createdAt: true })).toEqual({ id: 'p', createdAt: 'c' })
  })

  it('takes a whole group or part of it', () => {
    expect(p({ seo: true })).toEqual({ id: 'p', seo: { image: media } })
    expect(p({ seo: { image: { url: true } } })).toEqual({ id: 'p', seo: { image: { id: 'm', url: '/a.png' } } })
  })

  it('takes a relation as populate left it, or its listed fields', () => {
    expect(p({ author: true }).author).toBe(post.author)
    expect(p({ author: { name: true } })).toEqual({ id: 'p', author: { id: 'a', name: 'Ann' } })
    expect(p({ author: { name: true } }, { ...post, author: 'a' }).author).toBe('a')
    expect(p({ author: { name: true } }, { ...post, author: null }).author).toBeNull()
    expect(p({ tags: { name: true } }).tags).toEqual([{ id: 't1', name: 'one' }, { id: 't2', name: 'two' }])
  })

  it('takes a join item by item and skips missing keys', () => {
    const author = { id: 'a', name: 'Ann', posts: [post] }
    expect(p({ posts: { title: true } }, author, collections.authors.fields)).toEqual({ id: 'a', posts: [{ id: 'p', title: 'Hi' }] })
    expect(p({ avatar: true, name: true }, author, collections.authors.fields)).toEqual({ id: 'a', name: 'Ann' })
  })
})
```

- Run: `npx vitest run src/relations.test.ts -t pick`. Expected failure: `pick` is not exported (`TypeError: pick is not a function`).

GREEN
- `src/relations.ts`:

```ts
import { isObject } from './condition.ts'

/** Keys a read returns. `true` keeps the value; an object lists keys inside a group or a resolved relation or join. */
export type SelectSpec = { [key: string]: true | SelectSpec }

/** `doc` with only the keys in `select`. `id` is kept at every document level (`meta`). Values that are not objects stay as they are. */
export function pick(collections: Record<string, Collection>, fields: Fields, doc: Record<string, any>, select: SelectSpec, meta = true): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [key, s] of Object.entries(meta ? { id: true, ...select } : select)) {
    if (!(key in doc)) continue
    const value = doc[key]
    const f = fields[key]
    if (s === true || value == null || !f) out[key] = value
    else if (f.type === 'group') out[key] = isObject(value) ? pick(collections, f.fields, value, s, false) : value
    else if (f.type === 'relation' || f.type === 'join') {
      const target = collections[f.collection].fields
      out[key] = Array.isArray(value) ? value.map((d) => (isObject(d) ? pick(collections, target, d, s) : d)) : isObject(value) ? pick(collections, target, value, s) : value
    } else out[key] = value
  }
  return out
}
```

- Run again. Expect pass.

Commit: `feat(core): add pick for selected read fields`

### Task 2: `checkSelect()`

RED
- `src/relations.test.ts`, new `describe('checkSelect')`:

```ts
import { checkSelect, parsePopulate, pick } from './relations.ts'

describe('checkSelect', () => {
  const check = (select: Record<string, any>, spec: Parameters<typeof checkSelect>[3] = 2, name = 'posts') =>
    checkSelect(collections, collections[name].fields, select, spec)

  it('accepts fields, meta keys, groups and resolved relations', () => {
    expect(check({ title: true, createdAt: true, id: true })).toBeUndefined()
    expect(check({ seo: true })).toBeUndefined()
    expect(check({ seo: { image: { url: true } } })).toBeUndefined()
    expect(check({ author: { name: true, avatar: { url: true } } })).toBeUndefined()
    expect(check({ author: { name: true } }, { author: true })).toBeUndefined()
    expect(check({ author: true }, false)).toBeUndefined()
    expect(check({ posts: { title: true } }, { posts: true }, 'authors')).toBeUndefined()
    expect(check({ posts: true }, 2, 'authors')).toBeUndefined()
  })

  it.each([
    [{ titel: true }, 2],
    [{ author: { nam: true } }, 2],
    [{ title: { x: true } }, 2],
    [{ author: { name: true } }, false],
    [{ author: { name: true } }, 0],
    [{ author: { avatar: { url: true } } }, 1],
    [{ author: { avatar: { url: true } } }, { author: true }],
    [{ tags: { name: true } }, { author: true }],
    [{ constructor: true }, 2],
  ])('rejects %o with populate %o', (select, spec) => {
    expect(check(select, spec as never)).toEqual(expect.any(String))
  })

  it('names the offending path', () => {
    expect(check({ titel: true })).toBe('titel')
    expect(check({ author: { nam: true } })).toBe('author.nam')
    expect(check({ title: { x: true } })).toBe('title')
    expect(check({ author: { avatar: { url: true } } }, 1)).toBe('author.avatar')
    expect(check({ seo: { nope: true } })).toBe('seo.nope')
  })

  it('rejects a join that populate does not name', () => {
    expect(check({ posts: { title: true } }, 2, 'authors')).toBe('posts')
  })
})
```

- Run: `npx vitest run src/relations.test.ts -t checkSelect`. Expected failure: `checkSelect is not a function`.

GREEN
- `src/relations.ts`, after `pick`:

```ts
const META = ['id', 'createdAt', 'updatedAt']

/** The first path in `select` that does not fit `fields` and the populate `spec`, or `undefined`. Same resolution rules as `populate()`. */
export function checkSelect(collections: Record<string, Collection>, fields: Fields, select: SelectSpec, spec: Spec | true, prefix = ''): string | undefined {
  for (const [key, s] of Object.entries(select)) {
    const path = prefix + key
    if (s === true && META.includes(key)) continue
    if (!Object.hasOwn(fields, key)) return path
    if (s === true) continue
    const f = fields[key]
    const sub = typeof spec === 'object' ? spec[key] : spec
    if (f.type === 'group') {
      const error = checkSelect(collections, f.fields, s, sub === true ? 1 : sub, `${path}.`)
      if (error) return error
    } else if (f.type === 'relation' || f.type === 'join') {
      if (!sub || (f.type === 'join' && typeof spec !== 'object')) return path
      const next = sub === true ? false : typeof sub === 'number' ? sub - 1 : sub
      const error = checkSelect(collections, collections[f.collection].fields, s, next, `${path}.`)
      if (error) return error
    } else return path
  }
}
```

- Run again. Expect pass.

Commit: `feat(core): check select against the schema and populate`

### Task 3: `select` in the local API

RED
- `src/app.test.ts`, new `describe('select')` after `describe('populate')`, on the `relational` fixture:

```ts
describe('select', () => {
  let cms: ReturnType<typeof relational>
  let ids: Awaited<ReturnType<typeof seed>>
  beforeEach(async () => {
    cms = relational()
    ids = await seed(cms)
  })

  it('returns id and the selected fields from every read method', async () => {
    const { p } = ids
    const expected = { id: p.id, title: 'Hi', author: { id: ids.a.id, name: 'Ann' } }
    const select = { title: true, author: { name: true } } as const
    expect(await cms.find('posts', { select })).toEqual([expected])
    expect(await cms.findOne('posts', { where: { title: 'Hi' }, select })).toEqual(expected)
    expect(await cms.findById('posts', p.id, { select })).toEqual(expected)
    expect(await cms.findById('posts', p.id, { select: {} })).toEqual({ id: p.id })
    expect(await cms.findById('posts', p.id, { select: { createdAt: true } })).toEqual({ id: p.id, createdAt: p.createdAt })
  })

  it('selects inside a global and through a join', async () => {
    const { m, p, a } = ids
    await cms.setGlobal('site', { logo: m.id, featured: [p.id] })
    expect(await cms.getGlobal('site', { select: { featured: { title: true } } })).toEqual({ featured: [{ id: p.id, title: 'Hi' }] })
    expect(await cms.findById('authors', a.id, { populate: { posts: true }, select: { posts: { title: true } } })).toEqual({ id: a.id, posts: [{ id: p.id, title: 'Hi' }] })
  })

  it('rejects an unknown key, a nested object on a plain field and an unresolved relation', async () => {
    await expect(cms.find('posts', { select: { titel: true } } as never)).rejects.toThrow('Invalid select: titel')
    await expect(cms.find('posts', { select: { title: { x: true } } } as never)).rejects.toThrow('Invalid select: title')
    await expect(cms.find('posts', { populate: false, select: { author: { name: true } } } as never)).rejects.toThrow('Invalid select: author')
    await expect(cms.getGlobal('site', { select: { nope: true } } as never)).rejects.toThrow('Invalid select: nope')
  })

  it('runs after afterRead and before afterOperation', async () => {
    const seen: string[][] = []
    const keys = (d: object) => Object.keys(d).sort()
    const cms = defineCms({
      collections: {
        posts: {
          fields: { title: { type: 'text' }, body: { type: 'text' } },
          hooks: { afterRead: [({ docs }) => void seen.push(keys(docs[0]))], afterOperation: [({ result }) => void seen.push(keys((result as object[])[0]))] },
        },
      },
      database: { url: ':memory:' },
      secret: 'x'.repeat(32),
    })
    await cms.create('posts', { title: 'a', body: 'b' })
    await cms.find('posts', { select: { title: true } })
    expect(seen).toEqual([['body', 'createdAt', 'id', 'title', 'updatedAt'], ['id', 'title']])
  })
})
```

- Run: `npx vitest run src/app.test.ts -t '^select'`. Expected failure: every read returns whole documents (`toEqual` fails on extra keys), the rejects cases resolve. The `as never` casts keep the file compiling until Task 8 adds the types; Task 8 removes them.

GREEN
- `src/index.ts`:
  - Import `checkSelect`, `pick` and `SelectSpec` from `./relations.ts`.
  - `ReadOpts` gets `select?: SelectSpec`.
  - In `read()`, before the query:

```ts
if (options.select) {
  const error = checkSelect(collections, fields, options.select, spec(options))
  if (error) throw new Error(`Invalid select: ${error}`)
}
```

  - At the end of `read()`: `const result = await afterRead(s, { collection }, docs, 'read')` and `return options.select ? result.map((d) => pick(collections, fields, d, options.select!)) : result`.
  - `getGlobal`: the same check after the `Unknown global` check (with `spec(args.options)` inside the `run` callback, before `loadGlobal`), and `pick(collections, fields, doc, select)` on the one document after `afterRead`.
- `src/schema.ts`, `Options` (the `LocalApi` options): add `select?: Record<string, unknown>`.
- Run again. Expect pass. Run `pnpm test`: green.

Commit: `feat(core): select the fields a read returns`

### Task 4: `?select=` parsing

RED
- `src/relations.test.ts`, new `describe('parseSelect')`:

```ts
import { checkSelect, parsePopulate, parseSelect, pick } from './relations.ts'

describe('parseSelect', () => {
  it('builds nested objects from dot paths, longer path wins', () => {
    expect(parseSelect('title,path,parent.title,parent.path')).toEqual({ title: true, path: true, parent: { title: true, path: true } })
    expect(parseSelect('seo,seo.title')).toEqual({ seo: { title: true } })
    expect(parseSelect('seo.title,seo')).toEqual({ seo: { title: true } })
    expect(parseSelect('a.b.c')).toEqual({ a: { b: { c: true } } })
    expect(parseSelect('')).toEqual({})
    expect(parseSelect('title,,path')).toEqual({ title: true, path: true })
  })
})
```

- Run: `npx vitest run src/relations.test.ts -t parseSelect`. Expected failure: `parseSelect is not a function`.

GREEN
- `src/relations.ts`:

```ts
/** Parses `?select=`: dot paths, comma-separated. A longer path wins over its prefix. Keys are checked by `checkSelect()`. */
export function parseSelect(query: string): SelectSpec {
  const spec: Record<string, any> = {}
  for (const path of query.split(',').filter(Boolean)) {
    const keys = path.split('.')
    let node = spec
    for (const [i, key] of keys.entries()) {
      if (i === keys.length - 1) node[key] ??= true
      else node = node[key] = typeof node[key] === 'object' ? node[key] : {}
    }
  }
  return spec
}
```

- Run again. Expect pass.

Commit: `feat(core): parse select query paths`

### Task 4b: Name the path in populate errors

RED
- `src/relations.test.ts`, `describe('parsePopulate')`: the `rejects %o` cases expect the message instead of `undefined`: `Invalid populate: title`, `Invalid populate: nope`, `Invalid populate: author.nope`, `Invalid populate: ` (empty), `Invalid populate: constructor`, `Invalid depth: 3`, `Invalid depth: -1`, `Invalid depth: x`, `Invalid populate: author.posts.author`.
- `src/app.test.ts`, `describe('populate over HTTP')`, `rejects %s`: assert the body message too (`Invalid depth: 6`, `Invalid populate: title`, `Invalid populate: nope`, `Invalid populate: author.posts.author.posts.author.posts`).
- Run: `npx vitest run src/relations.test.ts -t parsePopulate` and `npx vitest run src/app.test.ts -t 'populate over HTTP'`. Expected failure: `undefined` and `Invalid populate`.

GREEN
- `src/relations.ts`, `parsePopulate()` returns `Spec | string`: the message for a bad `depth` or the path up to the failing key.
- `src/app.ts`: `readOptions()` returns the options or that message; the three read routes answer `c.json({ message: read }, 400)` when it is a string.
- Run again. Expect pass.

Commit: `feat(core): name the offending path in populate errors`

### Task 5: `select` over HTTP

RED
- `src/app.test.ts`, new `describe('select over HTTP')` after `describe('populate over HTTP')`, with the same `r` / `ids` / `get` setup as that block:

```ts
describe('select over HTTP', () => {
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

  it('returns only the selected fields', async () => {
    const { p, a, m } = ids
    const expected = { id: p.id, title: 'Hi', author: { id: a.id, name: 'Ann' } }
    expect((await get('/collections/posts?select=title,author.name')).body).toEqual([expected])
    expect((await get(`/collections/posts/${p.id}?select=title,author.name`)).body).toEqual(expected)
    expect((await get(`/collections/posts/${p.id}?select=`)).body).toEqual({ id: p.id })
    expect((await get(`/collections/posts/${p.id}?select=seo,seo.image.url`)).body).toEqual({ id: p.id, seo: { image: { id: m.id, url: '/a.png' } } })
    await r.cms.setGlobal('site', { logo: m.id })
    expect((await get('/globals/site?select=logo.url')).body).toEqual({ logo: { id: m.id, url: '/a.png' } })
  })

  it('is a reserved param, not a filter', async () => {
    expect((await get('/collections/posts?select=title&title=Hi')).body).toHaveLength(1)
    expect((await get('/collections/posts?select=title&title=No')).body).toHaveLength(0)
  })

  it.each(['?select=titel', '?select=title.x', '?populate=false&select=author.name', '?depth=1&select=author.avatar.url', '?populate=tags&select=author.name'])(
    'rejects %s',
    async (q) => {
      const list = await get(`/collections/posts${q}`)
      expect([list.status, list.body.message]).toEqual([400, expect.stringMatching(/^Invalid select: /)])
      expect((await get(`/collections/posts/${ids.p.id}${q}`)).status).toBe(400)
    },
  )

  it('rejects an unknown key on a global', async () => {
    expect((await get('/globals/site?select=nope')).body).toEqual({ message: 'Invalid select: nope' })
    expect((await get('/collections/posts?select=author.nope')).body).toEqual({ message: 'Invalid select: author.nope' })
  })
})
```

- Run: `npx vitest run src/app.test.ts -t 'select over HTTP'`. Expected failure: `?select=title` is treated as a filter on an unknown field, so the list route answers 400 `Invalid filter`; the id and global routes ignore it and return whole documents.

GREEN
- `src/app.ts`:
  - Import `checkSelect` and `parseSelect` from `./relations.ts`.
  - List route: `const { limit, populate, depth, select, ...query } = c.req.query()`, pass `{ populate, depth, select }` to `readOptions`. Update the comment above the route: `limit`, `populate`, `depth` and `select` are reserved.
  - `readOptions` (a string since Task 4b) also parses and checks `select`:

```ts
if (query.select === undefined) return read
const select = parseSelect(query.select)
const error = checkSelect(schema.collections ?? {}, fields, select, spec)
return error ? `Invalid select: ${error}` : { ...read, select }
```
 The `cms.find(name, { where, limit, ...read })` calls get `as never` only if the untyped `Cms<Schema>` rejects `select` before Task 8; remove it in Task 8 if added.
- Run again. Expect pass. The `rejects %s` cases of `populate over HTTP` still pass.

Commit: `feat(core): accept select in the read routes`

### Task 6: Private fields with `select`

RED
- `src/app.test.ts`, in `describe('private')`:

```ts
it('is left out of a select without a session and returned with one', async () => {
  const cms = make()
  const { client, fetch } = setup(cms)
  const p = await cms.create('people', person)
  const get = async () => (await fetch(`${origin}/api/cms/collections/people/${p.id}?select=name,email,contact.phone`)).json()
  expect(await get()).toEqual({ id: p.id, name: 'A' })
  await client.signUp(admin)
  expect(await get()).toEqual({ id: p.id, name: 'A', email: 'e', contact: { phone: 'p' } })
})
```

- Run: `npx vitest run src/app.test.ts -t 'left out of a select'`. Expected: passes already, because `strip()` runs on the picked document (see Decisions). This test pins that. If it fails, the public body has `contact: undefined` only in `toStrictEqual`; `toEqual` ignores it and the JSON never carries it.

GREEN
- No code. Keep the test.

Commit: `test(core): private fields stay hidden in a select`

### Task 7: The client and the Nuxt composable

RED
- `src/app.test.ts`, in `describe('select over HTTP')`:

```ts
it('selects through the client', async () => {
  const { client } = r
  const { p, a, m } = ids
  expect(await client.findById('posts', p.id, { select: { title: true, author: { name: true } } } as never)).toEqual({ id: p.id, title: 'Hi', author: { id: a.id, name: 'Ann' } })
  expect((await client.find('posts', { select: {} } as never))[0]).toEqual({ id: p.id })
  expect(await client.findOne('posts', { where: { title: 'Hi' }, populate: false, select: { author: true } } as never)).toEqual({ id: p.id, author: a.id })
  await r.cms.setGlobal('site', { logo: m.id })
  expect(await client.getGlobal('site', { select: { logo: { url: true } } } as never)).toEqual({ logo: { id: m.id, url: '/a.png' } })
})
```

- Run: `npx vitest run src/app.test.ts -t 'selects through the client'`. Expected failure: the client sends no `select`, so whole documents come back. The `as never` casts go away in Task 8.

GREEN
- `src/client.ts`, `readQuery()`:

```ts
function readQuery(options: { populate?: boolean | object; depth?: number; select?: object }) {
  const { populate, depth, select } = options
  return {
    populate: populate === false ? 'false' : typeof populate === 'object' ? paths(populate).join(',') || 'false' : undefined,
    depth,
    select: select && paths(select).join(','),
  }
}
```

  `request()` drops only `undefined`, so `select: {}` is sent as `select=` and reads as `{}` on the server. Update the comment above `paths()`: it serves `populate` and `select`.
- `src/nuxt/runtime/composables.ts`: nothing at runtime. `select` is part of `options`, so it reaches the client and the `useAsyncData` key (`JSON.stringify(options)`). The type change comes in Task 8.
- Run again. Expect pass.

Commit: `feat(client): send select as query paths`

### Task 8: Types

RED
- `src/schema.test.ts`, in `readTypes()` (the module-level `cms` fixture has `posts`, `authors`, `pages` and `site`):

```ts
const sel = (await cms.find('posts', { select: { title: true, author: { name: true } } }))[0]
sel.id satisfies string
sel.title satisfies string
sel.author?.name satisfies string | undefined
// @ts-expect-error not selected
sel.tags
// @ts-expect-error not selected inside the relation
sel.author?.avatar
// @ts-expect-error `createdAt` only when listed
sel.createdAt
const meta = await cms.findById('posts', 'x', { select: { createdAt: true } })
meta?.createdAt satisfies string | undefined
const idOnly = (await cms.find('posts', { select: {} }))[0]
idOnly satisfies { id: string }
const grp = (await cms.find('posts', { populate: { seo: { image: true } }, select: { seo: { image: { url: true } } } }))[0]
grp.seo?.image?.url satisfies string | undefined
// @ts-expect-error unknown key
cms.find('posts', { select: { titel: true } })
// @ts-expect-error unknown nested key
cms.find('posts', { select: { author: { nam: true } } })
// @ts-expect-error an object on a plain field
cms.find('posts', { select: { title: { x: true } } })
// @ts-expect-error an object on an unresolved relation
cms.find('posts', { populate: false, select: { author: { name: true } } })
// @ts-expect-error depth 1 resolves author but not avatar
cms.find('posts', { depth: 1, select: { author: { avatar: { url: true } } } })
// @ts-expect-error a join is resolved only when populate names it
cms.find('authors', { select: { posts: { title: true } } })
const jsel = (await cms.find('authors', { populate: { posts: true }, select: { posts: { title: true } } }))[0]
jsel.posts[0].title satisfies string
const gsel = await cms.getGlobal('site', { select: { logo: { url: true } } })
gsel.logo?.url satisfies string | undefined
// @ts-expect-error unknown global key
cms.getGlobal('site', { select: { nope: true } })
const ws = (await wide.find('x', { select: { anything: { nested: true } } }))[0]
ws.whatever
```

  Move the `wide` declaration above this block, or put the last two lines after it.
- `src/app.test.ts`, in `types client reads`:

```ts
const s = await client.findById('posts', 'x', { select: { title: true, author: { name: true } } })
s.title satisfies string
s.author?.name satisfies string | undefined
// @ts-expect-error not selected
s.tags
// @ts-expect-error unresolved relation
client.find('posts', { populate: false, select: { author: { name: true } } })
```

- Remove every `as never` added in Tasks 3, 5 and 7.
- Run: `pnpm --filter integral-cms typecheck`. Expected failure: `select` does not exist in `ReadOptions` (object literal may only specify known properties), and the `@ts-expect-error` lines are unused.

GREEN
- `src/schema.ts`:

```ts
/** Keys a `select` object may name: fields, `id`, `createdAt` and `updatedAt`. An object is allowed under a group, and under a relation or join that `P` resolves. */
export type Select<Cs, F extends Fields, P> = {
  [K in keyof F]?: F[K] extends { type: 'group'; fields: infer G extends Fields }
    ? true | Select<Cs, G, Sub<P, K> extends true ? 1 : Sub<P, K>>
    : F[K] extends { type: 'relation'; collection: infer C }
      ? Sub<P, K> extends false | 0 | undefined
        ? true
        : true | Select<Cs, FieldsOf<Cs, C>, Next<Sub<P, K>>>
      : F[K] extends { type: 'join'; collection: infer C }
        ? K extends Joins<F, P>
          ? true
          : true | Select<Cs, FieldsOf<Cs, C>, Next<Sub<P, K>>>
        : true
} & { id?: true; createdAt?: true; updatedAt?: true }
export type SelectArg<Cs, F extends Fields, P> = Wide<Cs> extends true ? Record<string, unknown> : Select<Cs, F, P>

/** `T` with only `id` and the keys of `S`, at every object level. Arrays and `null` pass through. */
type Selected<T, S> = S extends true
  ? T
  : T extends (infer U)[]
    ? Selected<U, S>[]
    : T extends object
      ? Simplify<{ [K in keyof T as K extends 'id' | keyof S ? K : never]: K extends keyof S ? Selected<T[K], S[K]> : T[K] }>
      : T
export type SelectOf<O> = O extends { select: infer S extends object } ? S : true

export type Read<Cs, F extends Fields, P, S = true> = Wide<Cs> extends true ? Record<string, any> : Selected<Resolve<Cs, F, P>, S>
export type ReadDoc<Cs, F extends Fields, P, S = true> = Wide<Cs> extends true ? Record<string, any> : Selected<Simplify<Resolve<Cs, F, P> & Meta>, S>

// An object under a key that allows only `true` maps to `never`; without that rule `keyof never` accepts every key.
export type Exact<P, A> = P extends object
  ? [A] extends [never]
    ? never
    : { [K in keyof P]: K extends keyof A ? Exact<P[K], Exclude<A[K], true | undefined>> : never }
  : P

export type ReadOptions<Cs, F extends Fields> = {
  populate?: boolean | PopulateArg<Cs, F>
  depth?: number
  /**
   * The fields a read returns, `id` always included. `true` keeps a value as `populate` leaves it; an object lists the keys inside a
   * group or a resolved relation or join. `createdAt` and `updatedAt` only when listed. `{}` returns `id` only. Default: every field.
   */
  select?: SelectArg<Cs, F, number>
}
/** Checks the `populate` and `select` literals in `O` against the fields at every level. `D` is the default depth. */
export type Checked<O extends ReadOptions<Cs, F>, Cs, F extends Fields, D extends number = 2> = O & {
  populate?: Exact<O['populate'], PopulateArg<Cs, F>>
  select?: Exact<O['select'], SelectArg<Cs, F, PopulateOf<O, D>>>
}
```

  `ReadDoc` used `Simplify<Read<…> & Meta>`; the new form keeps `Meta` inside the `Wide` branch so `Selected` sees it.
- `src/index.ts`: `ReadCollection<T, K, O, D>` becomes `ReadDoc<Collections<T>, Collections<T>[K]['fields'], PopulateOf<O, D>, SelectOf<O>>`, `ReadGlobal` the same with `Read`. Every `Checked<O, …>` in `bind()` gets `, D` as the fourth argument. Import `SelectOf`.
- `src/client.ts`: same in `ReadCollection<C, K, O>` and `getGlobal`'s `Read<…>`; every `Checked<O, …>` gets `, Depth<C>`. Re-export nothing new; `ReadOptions` already carries `select` and its JSDoc.
- `src/nuxt/runtime/composables.ts`: `type Depth = (typeof cms)['populate']['depth']` and `, Depth` on the four `Checked` uses.
- Run the typecheck again. Expect pass. If `Selected` hits TS2589 on `pages` (self-relation), replace `T extends object` with `T extends Record<string, unknown>` first; if that is not enough, add `[S] extends [true] ? T :` as the first branch so unselected reads never enter the mapped type. Then `pnpm test`: green (the removed `as never` casts change nothing at runtime).

Commit: `feat(core): type selected reads`

### Task 9: `breadcrumbs()`

RED
- New `src/helpers/breadcrumbs.test.ts`:

```ts
import { expect, it } from 'vitest'
import { breadcrumbs } from './breadcrumbs.ts'

const about = { id: 'a', title: 'About', path: '/about', parent: null }
const team = { id: 't', title: 'Team', path: '/about/team', parent: about }
const person = { id: 'p', title: 'Person', path: '/about/team/person', parent: team }

it('walks the parent chain from the root down', () => {
  expect(breadcrumbs(person)).toEqual([
    { title: 'About', path: '/about' },
    { title: 'Team', path: '/about/team' },
    { title: 'Person', path: '/about/team/person' },
  ])
})

it('is one entry for a root page', () => {
  expect(breadcrumbs(about)).toEqual([{ title: 'About', path: '/about' }])
  expect(breadcrumbs({ id: 'r', title: 'Root', path: '/' })).toEqual([{ title: 'Root', path: '/' }])
})

it('starts at the last resolved ancestor', () => {
  expect(breadcrumbs({ ...person, parent: { ...team, parent: 'a' } })).toEqual([
    { title: 'Team', path: '/about/team' },
    { title: 'Person', path: '/about/team/person' },
  ])
})

it('reads other field names and falls back to empty strings', () => {
  const doc = { name: 'Leaf', url: '/x/leaf', up: { name: 'X', url: '/x' } }
  expect(breadcrumbs(doc, { title: 'name', path: 'url', parent: 'up' })).toEqual([{ title: 'X', path: '/x' }, { title: 'Leaf', path: '/x/leaf' }])
  expect(breadcrumbs({ title: null })).toEqual([{ title: '', path: '' }])
})
```

- `src/helpers/seo-meta.test.ts`, in `helpers come from the main and the browser-safe client entry`: add `breadcrumbs: expect.any(Function)` to `toMatchObject`.
- Run: `npx vitest run src/helpers`. Expected failure: `Cannot find module './breadcrumbs.ts'`, and the entry test misses `breadcrumbs`.

GREEN
- New `src/helpers/breadcrumbs.ts`:

```ts
// Helpers run in browser bundles too, so this file MUST have no imports.

/** Field names `breadcrumbs()` reads. Each defaults to the name in `page.fields`. */
export type BreadcrumbsOptions = {
  /** The field shown as the crumb's text. Default `'title'`. */
  title?: string
  /** The field with the crumb's URL path. Default `'path'`. */
  path?: string
  /** The relation to the parent document, resolved by `populate`. Default `'parent'`. */
  parent?: string
}

/**
 * The breadcrumb trail of a document, from the root down to the document itself. One entry per resolved document in the
 * `parent` chain. The walk stops at a parent that is not an object (`null`, missing or an id `populate` did not resolve),
 * so the read MUST resolve as many levels as the tree has. Makes no queries. A missing `title` or `path` reads as `''`.
 */
export function breadcrumbs(doc: Record<string, any>, { title = 'title', path = 'path', parent = 'parent' }: BreadcrumbsOptions = {}) {
  const trail: { title: string; path: string }[] = []
  for (let d = doc; d && typeof d === 'object'; d = d[parent]) trail.unshift({ title: String(d[title] ?? ''), path: String(d[path] ?? '') })
  return trail
}
```

- `src/helpers/index.ts`: `export { type BreadcrumbsOptions, breadcrumbs } from './breadcrumbs.ts'`.
- `src/index.ts` and `src/client.ts`: add `breadcrumbs` to the `export { SLUG_PATTERN, seoMeta, slugify } from './helpers/index.ts'` line; `index.ts` also exports `type BreadcrumbsOptions`.
- Run again. Expect pass.

Commit: `feat(core): add breadcrumbs helper`

### Task 10: Breadcrumbs in the Astro example

No automated test (examples are not tested).

- `examples/astro/src/pages/[...path].astro` frontmatter:

```ts
import { breadcrumbs, seoMeta } from 'integral-cms'

const path = `/${Astro.params.path ?? ''}`
// Two parent levels resolved, so the trail covers three levels of pages.
const page = await Astro.locals.integral.findOne('pages', {
  where: { path },
  populate: { parent: { parent: true } },
  select: { title: true, path: true, body: true, seo: true, parent: { title: true, path: true, parent: { title: true, path: true } } },
})
if (!page) return new Response('Not found', { status: 404 })
const meta = seoMeta(page)
const trail = breadcrumbs(page)
```

  Body, above `<h1>`:

```astro
<nav aria-label="Breadcrumb">
  <ol>
    {trail.map((crumb, i) => (
      <li>{i === trail.length - 1 ? <span aria-current="page">{crumb.title}</span> : <a href={crumb.path}>{crumb.title}</a>}</li>
    ))}
  </ol>
</nav>
```

- `pnpm build:packages` (no watcher running), then `pnpm --filter example-astro typecheck`. `tsc` skips `.astro` frontmatter, so the build in Task 11 is the real check.
- Smoke test on a production build, own port and DB (in `examples/astro`):

```sh
rm -f /tmp/select-smoke.db && pnpm build
HOST=127.0.0.1 PORT=4322 DATABASE_URL=file:/tmp/select-smoke.db CMS_SECRET=$(head -c 48 /dev/urandom | base64) node ./dist/server/entry.mjs &
B=127.0.0.1:4322; J=/tmp/jar; rm -f $J
curl -s -c $J -H 'content-type: application/json' -H "origin: http://$B" -d '{"name":"Admin","email":"a@b.co","password":"password123"}' $B/api/cms/auth/sign-up/email
C=$(curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" -d '{"title":"Company","slug":"company"}' $B/api/cms/collections/pages | sed 's/.*"id":"\([^"]*\)".*/\1/')
curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" -d "{\"title\":\"Our team\",\"slug\":\"our-team\",\"parent\":\"$C\"}" $B/api/cms/collections/pages
curl -s "$B/api/cms/collections/pages?path=/company/our-team&populate=parent&select=title,path,parent.title,parent.path"
curl -s $B/company/our-team | grep -o '<nav aria-label="Breadcrumb">.*</nav>'
kill %1; rm -f /tmp/select-smoke.db $J
```

  Expect: the API answers `[{"id":…,"title":"Our team","path":"/company/our-team","parent":{"id":…,"title":"Company","path":"/company"}}]` and the page shows `<a href="/company">Company</a>` then `<span aria-current="page">Our team</span>`. `/company` shows one entry.

Commit: `feat(examples): show breadcrumbs on astro pages`

### Task 11: Docs and verification

- `README.md`:
  - "Read content": after the `populate` / `depth` paragraph, a `select` paragraph with the spec's local API example (`findOne` with `populate` and `select`), the rules table from the spec, the HTTP syntax (`?select=title,path,parent.title,parent.path`, longer path wins, `select` is reserved like `limit`, `populate` and `depth`), that `id` always comes back and `createdAt` / `updatedAt` only when listed, that `select` and `populate` are independent, and the errors (type error locally and in the client, 400 `Invalid select: <path>` over HTTP). The empty nested object: `select: { parent: {} }` is `{ id }` locally but `parent` (the whole value) over HTTP, as with `populate`. One client example line.
  - "Pages and SEO": after the `seoMeta()` bullets, `breadcrumbs()` with the spec's Astro snippet (the read with `populate` + `select` and the `<nav>`), the options and their defaults, that the walk stops at an unresolved parent and makes no queries. Add `breadcrumbs()` to the bullet that names `seoMeta()`, `slugify()` and `SLUG_PATTERN` as exports of `integral-cms` and `integral-cms/client`.
  - "Status": extend the public read API line with `select`, and the preset line with `breadcrumbs()`.
- `CLAUDE.md`, Architecture:
  - `src/schema.ts`: read types get `Select` (valid `select` keys per populate spec), `Selected` (narrows a resolved type to the selected keys, `id` kept), `SelectOf`, `Checked` takes the default depth `D`, `Exact` maps an object under a `true`-only key to `never`.
  - `src/index.ts`: `read()` and `getGlobal` check `select` with `checkSelect()` before the query and apply `pick()` after `afterRead`, so `afterOperation` sees the selected documents.
  - `src/relations.ts`: `pick()`, `checkSelect()` (same resolution rules as `populate()`), `parseSelect()` (`?select=`, longer path wins, no schema).
  - `src/app.ts`: reserved params are `limit`, `populate`, `depth` and `select`; `readOptions()` returns the options or the 400 message; `strip()` runs on the picked response.
  - `src/client.ts`: `readQuery()` sends `select` through `paths()`; `select: {}` is sent as `select=`.
  - `src/helpers/`: `breadcrumbs.ts` (`breadcrumbs()`).
  - Gotchas: `Exact<P, never>` accepted any object, because `keyof never` is every key; `Exact` now maps that to `never`. An empty nested `select` object is sent as the path itself over HTTP (`true`).
- Verification:
  1. `pnpm test`: all green.
  2. `pnpm typecheck` when no dev watcher runs, else `pnpm -r typecheck`. This covers the Nuxt example (`nuxt typecheck`) and the TanStack example, which use `Checked` through the client.
  3. `pnpm build`.
  4. The Astro smoke test from Task 10 on the production build on `127.0.0.1` with its own `DATABASE_URL`, showing the trail on `/company/our-team`. Delete the DB and the cookie jar after.

Commit: `docs: describe select and breadcrumbs`

## Decisions on the open questions

- **Empty nested object over HTTP.** Accepted. `select: { parent: {} }` returns `{ id }` in the local API and becomes `?select=parent` (`true`) over HTTP, like `populate`. The README says so in one line.
- **400 messages name the path.** For `select` and `populate`: `Invalid select: parent.nope`, `Invalid populate: author.nope`, `Invalid depth: 6`. The local API's `select` errors name the path too. Task 4b changes `parsePopulate()`; Tasks 2, 3 and 5 assert the paths.
- **Where the unit tests of `pick` live.** `relations.test.ts`, next to the code.

## Open questions

- **Meta keys inside groups at runtime.** `checkSelect` accepts `id`, `createdAt` and `updatedAt` with `true` at every level, groups included, where `pick` copies nothing because the keys are absent. The types reject them in groups. The spec says an unknown key at a level is a 400; the plan treats meta keys as known everywhere to keep `checkSelect` level-free.
- **`Selected` and TS2589.** The type is applied to the already resolved read type and only when `select` is given, so it should stay within limits; Task 8 names the two fallbacks if it does not. The spec's requirement that untyped schemas accept any `select` holds through the `Wide` branch in `Read` / `ReadDoc` and `SelectArg`.
