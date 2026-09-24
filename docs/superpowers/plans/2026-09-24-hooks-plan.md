# Plan: Hooks

Spec: `docs/superpowers/specs/2026-09-24-hooks-design.md`. Runs after specs 4 (Kysely, auth), 1 (group field) and 2 (relation and join, `populate`, `onDelete`). Spec 6 (`validate`, `unique`) and spec 5 (presets) build on it.

All paths are relative to `packages/core` unless noted. Run one test with `pnpm --filter integral-cms test -- src/app.test.ts -t '<name>'`. Type tests run with `pnpm --filter integral-cms typecheck` (vitest does not check types).

## Starting point (assumed from specs 4, 1, 2)

- `src/db/index.ts` exports `createDb()` (a `Kysely<Database>`) and `migrate()`. `db.transaction().execute(trx => …)` works (spec 4, Task 1).
- `:memory:` libsql has one connection. While a transaction holds it, any query outside the transaction rejects with `TRANSACTION_ACTIVE`. Every query inside a write MUST use `trx`.
- Writes are single statements without a transaction (spec 4 plan left them unwrapped). This plan wraps every write.
- `Field` has `group`, `relation`, `join`. `populate()` loads relations in batches per hop. `delete` runs `onDelete` effects (`set-null`, `restrict` 409, `cascade`) with direct SQL.
- Validation runs in `app.ts` (HTTP only). The local API does not validate.
- `src/errors.ts` exists, has no imports and exports `ConflictError` (409, with `references`). `integral-cms` re-exports it. Spec 2's 400s use `HttpError` in `src/relations.ts`.

Before Task 1, read `src/index.ts` as it is then: where `populate()`, the relation id checks (400) and the `onDelete` scan live. Task sketches below name them `populate()`, `checkRelations()` and `onDeleteEffects()`; use the real names.

## Design

### Operation scope

One internal type in `src/index.ts`:

```ts
type Scope = {
  trx?: Transaction<Database>
  user: User | null
  context: Record<string, unknown>
  // true for calls made from inside a hook: no own afterError, no new context
  nested: boolean
}
```

- `bind(scope)` returns the local API methods (`find`, `findOne`, `findById`, `create`, `update`, `delete`, `getGlobal`, `setGlobal`) for that scope. The exported `cms` is `bind({ user: null, context: {}, nested: false })` plus `schema`, `auth`, `fetch`.
- Every method goes through one `run()`:

```ts
async function run<R>(scope: Scope, operation: Operation, target: string, fn: (s: Scope & { cms: LocalApi }) => Promise<R>) {
  const context = scope.nested ? scope.context : {}
  const inner = (trx = scope.trx) => { const s = { ...scope, trx, context, nested: true }; return { ...s, cms: bind(s) } }
  try {
    if (!isWrite(operation) || scope.trx) return await fn(inner())
    return await (await db()).transaction().execute((trx) => fn(inner(trx)))
  } catch (error) {
    if (!scope.nested && !expected(error)) await afterError(error, operation, target, scope)
    throw error
  }
}
const q = (s: Scope) => s.trx ?? db()
// Expected errors (400, 409) run no afterError.
const expected = (e: unknown) => e instanceof ValidationError || e instanceof ConflictError
```

- Hooks get `cms: s.cms`, so nested calls reuse `trx` and share `context`.
- Reads open no transaction. A read inside a write uses `trx` through `q(s)`.
- `afterError` runs once, at the outermost call, after rollback, and only for unexpected errors.

### Hook runner

```ts
const list = <F>(slot?: F[] | Record<string, F>) => (Array.isArray(slot) ? slot : Object.values(slot ?? {}))

// A hook MAY return a replacement for the main value; `undefined` keeps it.
async function hooks<V>(slot: Slot<any> | undefined, key: string, value: V, args: object): Promise<V> {
  for (const fn of list(slot)) value = (await fn({ ...args, [key]: value })) ?? value
  return value
}
```

`fieldHooks(stage, fields, data, args, prefix = '')` walks `fields` in order. For each field it runs the field's hooks with `{ value, data, siblingData, path, ...args }`, writes a returned value into `siblingData`, then recurses into a `group` value with `path` prefix `key.`. It works on a copy (`structuredClone`) of the input.

### HTTP

- `createApp(cms, asUser)` gets `asUser(user) => bind({ user, context: {}, nested: false })` from `defineCms`, so no internal API is public. The session middleware stores `asUser(session.user)` in `c.var.cms`. Write routes use it; read routes use `cms` (`user: null`).
- `app.ts` stops validating. It passes the raw JSON body to the local API.
- `api.onError`: `ValidationError` → 400 `{ errors }`; `ConflictError` → 409 as today; anything else → 500 `{ error: 'Internal Server Error' }`. Spec 2's `HttpError` goes away (Task 2).

## Tasks

### Task 1: Spike: hook argument types

The riskiest part. Do it first; if inference fails, stop and discuss before building the runtime.

RED
- `src/schema.test.ts`, test `hook types › infers arguments from the fields of the same defineCollection call`:

```ts
it('infers arguments from the fields of the same defineCollection call', () => {
  const posts = defineCollection({
    fields: { title: { type: 'text', required: true, hooks: { beforeChange: [({ value }) => value?.toUpperCase()] } }, views: { type: 'number' } },
    hooks: {
      beforeChange: [({ data }) => {
        data.title satisfies string
        // @ts-expect-error unknown field
        data.nope
      }],
      afterRead: { count: ({ docs }) => docs.map((d) => ({ ...d, views: (d.views ?? 0) + 1 })) },
    },
  })
  // A typed collection is accepted by defineCms.
  defineCms({ collections: { posts }, database: { url: ':memory:' }, secret: '' })
  // @ts-expect-error field hook value is a number
  defineCollection({ fields: { n: { type: 'number', hooks: { beforeChange: [({ value }) => value?.toUpperCase()] } } } })
})
```

- Run `pnpm --filter integral-cms typecheck`. Expected failure: `'hooks' does not exist in type` on the field and the collection.

GREEN (`src/schema.ts`)

```ts
type Awaitable<T> = T | Promise<T>
export type Slot<Fn> = Fn[] | Record<string, Fn>
export type Operation = 'create' | 'update' | 'delete' | 'read' | 'getGlobal' | 'setGlobal'
type Common = { cms: Cms<Schema>; user: User | null; context: Record<string, unknown>; collection?: string; global?: string }

type FieldHook<V> = (a: Common & { value: V | null | undefined; data: Record<string, unknown>; siblingData: Record<string, unknown>; originalDoc?: Record<string, unknown>; path: string; operation: Operation }) => Awaitable<V | null | undefined | void>
export type FieldHooks<V> = { [K in 'beforeValidate' | 'beforeChange' | 'afterChange' | 'afterRead']?: Slot<FieldHook<V>> }

export type CollectionHooks<F extends Fields> = {
  beforeOperation?: Slot<(a: Common & { operation: Operation; args: Record<string, unknown> }) => Awaitable<Record<string, unknown> | void>>
  beforeValidate?: Slot<(a: Common & { operation: Operation; id?: string; originalDoc?: Doc<F>; data: Partial<Data<F>> }) => Awaitable<Partial<Data<F>> | void>>
  beforeChange?: Slot<(a: Common & { operation: Operation; id?: string; originalDoc?: Doc<F>; data: Data<F> }) => Awaitable<Data<F> | void>>
  afterChange?: Slot<(a: Common & { operation: Operation; doc: Doc<F>; previousDoc?: Doc<F> }) => Awaitable<Doc<F> | void>>
  beforeRead?: Slot<(a: Common & { operation: Operation; docs: Doc<F>[] }) => Awaitable<Doc<F>[] | void>>
  afterRead?: Slot<(a: Common & { operation: Operation; docs: Doc<F>[] }) => Awaitable<Doc<F>[] | void>>
  beforeDelete?: Slot<(a: Common & { id: string; doc: Doc<F> }) => Awaitable<void>>
  afterDelete?: Slot<(a: Common & { id: string; doc: Doc<F> }) => Awaitable<void>>
  afterOperation?: Slot<(a: Common & { operation: Operation; args: Record<string, unknown>; result: unknown }) => Awaitable<unknown>>
  afterError?: Slot<(a: Common & { operation: Operation; error: unknown }) => Awaitable<void>>
}
export type GlobalHooks<F extends Fields> = Pick<CollectionHooks<F>, 'beforeValidate' | 'beforeChange' | 'afterChange' | 'beforeRead' | 'afterRead'>
```

- `Base` becomes `Base<V> = { label?; required?; hooks?: FieldHooks<V> }`; each `Field` member passes its value type (`string`, `number`, `boolean`, `Record<string, unknown>` for `group`, `unknown` for `relation`).
- `Collection<F extends Fields = Fields> = { …; fields: F; hooks?: CollectionHooks<F> }`, same for `Global<F>`.
- `defineCollection<const F extends Fields>(c: Collection<F>) { return c }`, same for `defineGlobal`.
- `defineCms` constraints become `Record<string, Collection<any>>` and `Record<string, Global<any>>`. Hook parameters are contravariant, so `Collection<{ title }>` is not assignable to `Collection<Fields>`.
- `User` is `import type { User } from 'better-auth'`. `Cms` is `import type` from `./index.ts`.
- Run the typecheck again. Expect pass. Also run `pnpm --filter integral-cms test` (types only, nothing breaks at runtime).

If the spike fails:
- `Cms<Schema>` circular (`'cms' implicitly has type 'any'`): type `cms` as a hand-written `LocalApi` with string names.
- `data` inferred as `any`: make `hooks` a second inference site with `NoInfer<F>`: `Collection<F> & { hooks?: CollectionHooks<NoInfer<F>> }`.

Inline collections in `defineCms({ collections: { posts: { fields, hooks } } })` get untyped (`any`) hook arguments. Typed hooks need `defineCollection`. The docs say so.

Field hooks type only `value`. Their `data`, `siblingData` and `originalDoc` stay `Record<string, unknown>` (accepted limit in the spec), so the test checks `value` only.

Commit: `feat(core): add hook types`

### Task 2: `ValidationError`, validation in the local API

RED
- `src/app.test.ts`, describe `validation`:
  - `local API rejects invalid data with ValidationError`: `await expect(cms.create('posts', { title: '' })).rejects.toMatchObject({ errors: { title: expect.any(String) } })` and `rejects.toBeInstanceOf(ValidationError)`.
  - `HTTP returns field errors`: raw `fetchWithSession('/collections/posts', POST { title: '' })` → 400, body `{ errors: { title: expect.any(String) } }`.
- Run `-t validation`. Expected failure: `ValidationError` is not exported; the local create resolves.

GREEN
- `src/errors.ts` (spec 2 created it with `ConflictError`). It MUST stay free of imports: presets (spec 5) import it in browser bundles.

```ts
/** Thrown by hooks and validation. Keys are field paths, e.g. `seo.title`. HTTP returns 400 with `{ errors }`. */
export class ValidationError extends Error {
  constructor(public errors: Record<string, string>) {
    super(Object.values(errors)[0] ?? 'Invalid data')
  }
}
```

- `src/schema.ts` imports `ValidationError` from `./errors.ts`:

```ts
export function parseData(schema: z.ZodType, data: unknown) {
  const result = schema.safeParse(data)
  if (!result.success) throw new ValidationError(Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message])))
  return result.data as Record<string, unknown>
}
```

- `src/index.ts`: `export { ConflictError, ValidationError } from './errors.ts'`. Build the validators once in `defineCms` (move them from `app.ts`). `create`, `update`, `setGlobal` call `parseData` first. Spec 2's relation id checks throw `ValidationError` keyed by field path; delete `HttpError` from `src/relations.ts`.
- Unknown names: `create` / `setGlobal` throw `Unknown collection`, `update` returns `undefined`, `delete` is a no-op (keeps `do not find a document through another collection` green).
- `src/app.ts`: drop `validators` and the `safeParse` calls; pass `await c.req.json().catch(() => undefined)` through. Add `api.onError` (see Design). A malformed body fails zod, so it stays 400.
- `src/client.ts`: `CmsError` message falls back to `Object.values(body?.errors ?? {})[0]`. Remove the `body?.error?.[0]` branch if nothing else sends it.
- Update the doc comments that say "Does not validate `data`".
- Run `-t validation`, then the whole suite. Expect green.

Commit: `feat(core): validate writes in the local API and return field errors`

### Task 3: Collection write hooks

RED
- `src/app.test.ts`: make `setup()` take a factory, `setup(make = () => define('x'.repeat(32)))`, typed by the factory's return. Add a helper:

```ts
const calls: string[] = []
const log = (name: string) => () => void calls.push(name)
const stages = ['beforeOperation', 'beforeValidate', 'beforeChange', 'afterChange', 'afterRead', 'afterOperation'] as const
```

- Describe `hooks`:
  - `run in order on create and update`: `posts` with `hooks: Object.fromEntries(stages.map((s) => [s, [log(s)]]))`. `cms.create`, then `cms.update`. Expect `calls` to equal `stages` twice.
  - `accept arrays and records in key order`: `beforeChange: { b: log('b'), a: log('a') }` → `['b', 'a']`; the array form gives the same.
  - `use a returned value and keep the input on undefined`: `beforeValidate` returns `{ ...data, title: data.title.trim() }`, a second `beforeValidate` returns nothing, `afterChange` returns `{ ...doc, extra: 1 }`, `afterOperation` returns `{ ...result, op: 1 }`. Expect the stored title trimmed, the returned doc to have `extra` and `op`, `findById` to have neither.
  - `pass operation, id and originalDoc`: `beforeChange` records its args; on update `operation === 'update'`, `id`, `originalDoc.title` is the old title; `afterChange` gets `previousDoc`.
- Run `-t hooks`. Expected failure: `calls` is `[]`.

GREEN (`src/index.ts`)
- Add `Scope`, `bind()`, `run()` without the transaction branch (Task 5 adds it), `list()`, `hooks()`.
- Write pipeline, shared by `create` and `update`:

```ts
async function write(s: Inner, collection: string, args: { id?: string; data: unknown }, operation: 'create' | 'update') {
  const { fields, hooks: h } = collections[collection]
  const originalDoc = args.id ? await loadRaw(s, collection, args.id) : undefined
  if (args.id && !originalDoc) return undefined
  const base = { cms: s.cms, user: s.user, context: s.context, collection, operation, id: args.id, originalDoc }
  let data = await hooks(h?.beforeValidate, 'data', structuredClone(args.data), base)
  data = parseData(validators[collection], data)
  data = await hooks(h?.beforeChange, 'data', data, base)
  await checkRelations(s, collection, data)
  const doc = toDoc(await insertOrUpdate(q(s), collection, args.id, data))
  const changed = await hooks(h?.afterChange, 'doc', doc, { ...base, previousDoc: originalDoc })
  return (await afterRead(s, collection, [changed], operation))[0]
}
```

- `create` / `update` in `bind()`: `run(scope, op, collection, async (s) => { const args = await hooks(h?.beforeOperation, 'args', { collection, id, data }, …); return hooks(h?.afterOperation, 'result', await write(s, …), { …, args }) })`.
- `loadRaw` reads one row with `q(s)` and no populate.
- Run `-t hooks`, then the whole suite. Expect green.

Commit: `feat(core): run collection write hooks`

### Task 4: `/schema` without hooks

RED
- Test `hooks › are not sent in /schema`: a collection with an array and a record hook; `client.getSchema()` has no `hooks` key at any level (`JSON.stringify(schema)` does not contain `"hooks"`).
- Run `-t 'not sent'`. Expected failure: `"hooks":{"beforeChange":[null]}` in the response.

GREEN
- `app.ts`: `c.json(JSON.parse(JSON.stringify(schema, (key, value) => (key === 'hooks' ? undefined : value))))`, computed once at startup. Spec 6 replaces this with its function-free schema.
- Run again. Expect pass.

Commit: `fix(core): keep hooks out of the schema response`

### Task 5: Every write in one transaction; `cms` in hooks uses it

RED
- Test `transactions › roll back the write and nested writes`: collections `posts` and `logs`. `posts.afterChange`: `await cms.create('logs', { message: 'x' }); throw new Error('boom')`. Expect `cms.create('posts', …)` to reject with `boom`; then `cms.find('posts')` and `cms.find('logs')` are both `[]`.
- Test `transactions › nested calls run on the write's transaction`: `posts.beforeChange` calls `await cms.find('logs')` and `await cms.create('logs', …)`; `afterChange` calls `cms.findById('logs', id)`. Database `:memory:`. Expect the create to resolve and one log stored.
- Run `-t transactions`. Expected failure: the first test finds the post and the log (no transaction). The second passes for now.

GREEN
- Add the transaction branch to `run()` (see Design).
- Check that the second test guards the binding: temporarily pass the root `cms` instead of `s.cms` in hook args and run `-t 'nested calls'`. Expected failure: `TRANSACTION_ACTIVE`. Revert to `s.cms`.
- Every query in the pipeline (`loadRaw`, `insertOrUpdate`, `checkRelations`, `populate`, `onDeleteEffects`) MUST take `q(s)`. `grep -n 'await db()' src/index.ts` must only show `run()` and top-level reads.
- Run `-t transactions`, then the whole suite. Expect green.

Commit: `feat(core): run writes and their hooks in one transaction`

### Task 6: Validate again after `beforeChange`

RED
- Test `hooks › validate the beforeChange result`: `beforeChange` returns `{ ...data, title: '' }`. `client.create` → 400 with `errors.title`; nothing stored. Same for `setGlobal` once Task 10 exists (add it there).
- Run `-t 'beforeChange result'`. Expected failure: 201, the empty title is stored.

GREEN
- In `write()`: `data = parseData(validators[collection], await hooks(h?.beforeChange, …))`.
- Run again. Expect pass.

Commit: `feat(core): validate data returned by beforeChange`

### Task 7: Read hooks

RED
- Test `hooks › run in order on reads`: `beforeOperation`, `beforeRead`, `afterRead`, `afterOperation` log. `cms.find`, `cms.findOne`, `cms.findById` each give exactly those four, once.
- Test `hooks › run afterRead once per find with all docs`: three posts; `afterRead` pushes `docs.length`. `cms.find('posts')` → `[3]`. Returning `docs.map(d => ({ ...d, title: d.title.toUpperCase() }))` changes the result.
- Run `-t 'reads'`. Expected failure: `calls` is `[]`.

GREEN
- Internal `read(s, collection, options)`: query with `q(s)`, `beforeRead` on the batch, `populate(s, …)`, `afterRead(s, collection, docs, 'read')`.
- `afterRead(s, collection, docs, operation)` is the one place for field and collection `afterRead` (write pipeline uses it too).
- `find`, `findOne`, `findById` each call `run()` once with `beforeOperation` / `afterOperation` and use `read()`, so `findOne` does not run hooks twice.
- Run `-t reads`, then the whole suite.

Commit: `feat(core): run collection read hooks`

### Task 8: Delete hooks

RED
- Test `hooks › run in order on delete`: all delete-related stages log; `cms.delete` → `['beforeOperation', 'beforeDelete', 'afterDelete', 'afterOperation']`. `beforeDelete` and `afterDelete` get `id` and the stored `doc`.
- Test `hooks › do not run for a missing document`: `cms.delete('posts', 'missing')` → `['beforeOperation', 'afterOperation']`.
- Run `-t delete`. Expected failure: `calls` is `[]`.

GREEN
- `delete` in `bind()`: `run()` → `beforeOperation` → `loadRaw` (missing: skip to `afterOperation`) → `beforeDelete` → delete the row, then `onDeleteEffects(s, …)` → `afterDelete` → `afterOperation`.
- The row goes first. A cascade that comes back to it finds nothing, which ends cycles (see Task 15).
- Run `-t delete`, then the whole suite.

Commit: `feat(core): run delete hooks`

### Task 9: Field hooks

RED
- Test `hooks › run field hooks before collection hooks, depth-first into groups`: fields `title` and `seo: { type: 'group', fields: { title } }`, each with a log hook per field stage (`beforeValidate`, `beforeChange`, `afterChange`, `afterRead`) that pushes `` `${path}:${stage}` ``, plus collection hooks. On `create`, expect for each stage `title:<stage>`, `seo:<stage>`, `seo.title:<stage>`, then the collection's `<stage>`, with `beforeOperation` first and `afterOperation` last. This is the full order test from the spec.
- Test `hooks › give field hooks value, siblingData and path`: `seo.title`'s `beforeChange` returns `siblingData.title ?? data.title`. Create `{ title: 'A', seo: {} }` → stored `seo.title === 'A'`. Its `path` is `'seo.title'`.
- Test `hooks › run field afterRead once per value`: three posts; the `title` field `afterRead` counts calls; `find` → 3.
- Run `-t 'field'`. Expected failure: field hooks never run.

GREEN
- `fieldHooks()` (see Design). A group's own hooks run before its children.
- In `write()`: `fieldHooks(stage, …)` before `hooks(h?.[stage], …)` for `beforeValidate`, `beforeChange`, `afterChange`. In `afterRead()`: per doc, then the collection hook once per batch.
- Run `-t field`, then the whole suite.

Commit: `feat(core): run field hooks`

### Task 10: Global hooks

RED
- Test `hooks › run on globals`: `site` global with `beforeValidate`, `beforeChange`, `afterChange`, `beforeRead`, `afterRead` and a field hook. `setGlobal` → write stages in order; `getGlobal` → `beforeRead`, `afterRead` with `docs` of length 1 and `global: 'site'`. `afterRead` returning `[{ ...docs[0], name: 'X' }]` changes `getGlobal`.
- Extend Task 6's test: `setGlobal` with a `beforeChange` that returns invalid data → 400.
- Run `-t globals`. Expected failure: `calls` is `[]`.

GREEN
- `write()` and `afterRead()` take a target `{ fields, hooks, collection? , global? }` instead of a collection name, so globals reuse them. `setGlobal` upserts with `q(s)`; `getGlobal` reads with `q(s)`, then `beforeRead` / populate / `afterRead` on `[data]`. Globals have no `beforeOperation` / `afterOperation` (spec table).
- Run `-t globals`, then the whole suite.

Commit: `feat(core): run global hooks`

### Task 11: `afterError` and HTTP 500

RED
- Test `errors › run afterError and hide the message`: `defineCms({ hooks: { afterError: [log('root')] }, collections: { posts: { hooks: { afterError: [log('collection')], beforeChange: [() => { throw new Error('secret') }] } } } })`.
  - `cms.create` rejects with `secret`; `calls` is `['collection', 'root']`; `afterError` got `operation: 'create'`, `collection: 'posts'`.
  - Over HTTP: status 500, body does not contain `secret`.
  - A `ValidationError` from `beforeChange` runs no `afterError` and returns 400.
  - A `ConflictError` (`restrict` 409) from a delete runs no `afterError`: `posts` gets a required relation `notes.post` (restrict by default); deleting a referenced post leaves `calls` empty.
  - A global operation runs only root `afterError`: a `site` global whose `beforeChange` throws; `cms.setGlobal` → `calls` is `['root']`, with `global: 'site'`.
  - A throwing `afterError` logs and the original error is rethrown.
  - A nested call that throws runs `afterError` once, for the outer operation.
- Run `-t afterError`. Expected failure: `calls` is `[]`; `hooks` is not a `defineCms` option.

GREEN
- `CmsOptions` gets `hooks?: { afterError?: Slot<RootAfterError> }` (type in `schema.ts`).
- `afterError(error, operation, target, scope)` in `index.ts`: collection hooks, then root hooks, each in `try` / `catch` with `consola.withTag('integral').error(e)`. Globals run root hooks only, with `global` set (spec). Hooks get the root `cms` (the transaction is gone). `run()` skips it for `expected()` errors.
- `app.ts` `onError` already hides the message (Task 2); this test proves it.
- Run `-t afterError`, then the whole suite.

Commit: `feat(core): add afterError hooks`

### Task 12: `user`

RED
- Test `hooks › get the session user on HTTP writes`: `beforeChange` and `afterRead` record `user?.email`. After `client.signUp(admin)`: `client.create` → `['a@b.co', 'a@b.co']`. A public `client.find` → `null`. `cms.create` (local) → `null`. A nested `cms` call in a hook sees the same user.
- Run `-t 'session user'`. Expected failure: `user` is `null` for the HTTP write.

GREEN
- `createApp(cms, asUser)`. The session middleware: `c.set('cms', asUser(session.user))`. Write routes use `c.var.cms`. Type the Hono app with `Variables: { cms: Cms<Schema> }`.
- Run the test, then the whole suite.

Commit: `feat(core): pass the session user to hooks`

### Task 13: `context` and loops

RED
- Test `hooks › share context with nested calls`: `posts.beforeChange` sets `context.source = 'posts'`; `posts.afterChange` calls `cms.create('logs', { message: 'x' })`; `logs.beforeChange` returns `{ ...data, message: context.source }`. Expect the stored log message `posts`. A second top-level `cms.create('logs', …)` sees an empty `context`.
- Test `hooks › stop a loop with context`, the documented pattern:

```ts
afterChange: [async ({ doc, cms, context }) => {
  calls.push('afterChange')
  if (context.counted) return
  context.counted = true
  await cms.update('posts', doc.id, { ...doc, views: (doc.views ?? 0) + 1 })
}]
```

  Expect `calls` of length 2 and stored `views === 1`.
- Run `-t context`. Expected failure: none if `run()` already shares `context` (Task 3). If both pass, keep them as the spec's required tests and commit them as `test`.

Commit: `test(core): cover hook context and loop guards`

### Task 14: Populated documents run their read hooks

RED
- Test `hooks › run read hooks on populated documents once per collection per hop`: `authors`, `tags`, `posts` (`author` relation, `tags` many). `authors.afterRead` and `tags.afterRead` push `` `${collection}:${docs.length}` ``; `authors.beforeRead` sets `context.seen = true`, and `posts.afterRead` records `context.seen`. Three posts, two authors, two tags. `cms.find('posts')` → `['authors:2', 'tags:2']` in any order, each once, and `seen === true`. Field `afterRead` on `authors.name` changes the populated value.
- Run `-t 'populated'`. Expected failure: `authors`/`tags` hooks never run.

GREEN
- In `populate(s, …)`, after each hop's batch query for one target collection: `docs = await hooks(target.hooks?.beforeRead, 'docs', docs, …)`, populate the next hop, then `afterRead(s, target, docs, 'read')`. Same `s`, so `context` and `trx` carry over.
- Join results (spec 2) go through the same path.
- Run the test, then the whole suite.

Commit: `feat(core): run read hooks on populated documents`

### Task 15: `onDelete` effects through `update` and `delete`

RED
- Test `hooks › onDelete effects run the referencing collection's hooks`: `authors`; `posts` with `author` (`set-null`) and `beforeChange` / `afterChange` log hooks; `comments` with `post` (`cascade`) and `beforeDelete` / `afterDelete` log hooks.
  - Delete an author: each referencing post runs `beforeChange` / `afterChange` with `operation: 'update'` and `data.author === null`.
  - Delete a post: its comments run `beforeDelete` / `afterDelete`.
  - A `beforeChange` on `posts` that throws during the `set-null` update rolls back the author delete (author still there).
- Run `-t onDelete`. Expected failure: no hook calls, because effects use direct SQL.

GREEN
- `onDeleteEffects(s, collection, id)`: keep spec 2's scan (with `q(s)`); replace the SQL writes:
  - `set-null`: load the referencing doc raw, set the path to `null` (single) or filter the id out (`many`), then `s.cms.update(coll, docId, data)` or `s.cms.setGlobal(name, data)`. Spec 6 (Task 9) swaps these for the internal operations with a flag, so they skip `validate`.
  - `cascade`: `s.cms.delete(coll, docId)`. The row delete comes first (Task 8), so a cycle ends at a missing document. Drop spec 2's visited set if its cycle test stays green.
  - `restrict`: unchanged; the throw rolls back the transaction.
- Run `-t onDelete`, then the whole suite, including spec 2's `cascade` cycle test.

Commit: `feat(core): run onDelete effects through operations with hooks`

### Task 16: Admin shows field errors

No unit tests for the admin (see CLAUDE.md). Manual verification below.

- `packages/admin/src/components/DocForm.vue`: `const errors = ref<Record<string, string>>({})`. In `catch`: `errors.value = (e instanceof CmsError && e.body?.errors) || {}`; `error.value = errors.value[''] ?? (Object.keys(errors.value).length ? 'Please fix the marked fields' : (e as Error).message)`. Clear `errors` on submit. Pass `:errors="errors"` to each `FieldInput`.
- `FieldInput.vue`: props `errors?: Record<string, string>` and `path?: string` (defaults to `name`). Below the input, in both branches: `<span v-if="errors?.[path ?? name]" class="text-xs text-red-600" role="alert">…</span>`. Mark the input `aria-invalid`. The group branch (spec 1) passes `:path="`${path ?? name}.${key}`"` and `errors` to children.
- `CmsError` comes from `../../core/src/client` in `api.ts` (re-export it).

Manual verification:
1. In `examples/astro/collections/posts.ts`, add a temporary hook: `beforeChange: [({ data }) => { if (data.title === 'taken') throw new ValidationError({ title: 'Already used' }) }]`.
2. Delete `examples/astro/cms.db`, `pnpm dev:astro`, sign up at `http://localhost:4321/admin`.
3. Create a post titled `taken`: "Already used" shows under Title, the form keeps its values, nothing is saved.
4. Change the title and save: the error clears, the post saves.
5. If spec 1's group exists in the example, throw on `seo.title` and check the message shows inside the group.
6. Remove the temporary hook and `cms.db`. `npx astro dev stop`.

Commit: `feat(admin): show field errors from the API`

### Task 17: Docs

- `README.md`:
  - Usage: a "Hooks" section with one collection example (`beforeChange` record, `afterRead`), the order diagrams from the spec, the argument table in short form, `ValidationError`, `context` loop guard, and the typing limits: "use `defineCollection` for typed hook arguments; `cms` in hooks is untyped; field hooks type only `value`". `afterError` runs for unexpected errors only (not 400 or 409); global operations run only root `afterError`.
  - Transactions: every write runs in one transaction with its hooks and nested `cms` calls. On drivers without interactive transactions (D1 later), hooks run in the same order without isolation (the spec requires this sentence).
  - Payload mapping: same hook names; `req.user` → `user`, `req.context` → `context`, `req.payload` → `cms`.
  - Status: add hooks; remove roadmap item 7.
- `CLAUDE.md`:
  - Architecture, `src/index.ts`: every local API method goes through `run()` with a `Scope` (`trx`, `user`, `context`, `nested`); `bind(scope)` builds the API that hooks get; `write()`, `read()`, `afterRead()`, `fieldHooks()`. `src/schema.ts`: hook types, `parseData`. `src/errors.ts`: `ValidationError` and `ConflictError`, no imports. `src/app.ts`: no validation of its own; `onError` maps errors; `asUser()` for the session user.
  - Design decisions: "Validation and hooks live in the local API; HTTP is a thin layer." "Writes run in one transaction; nested calls MUST go through the hook's `cms`."
  - Conventions: replace "Validate all API input with `dataSchema()`" with "The local API validates every write with `parseData()`".
  - Gotchas: any query inside a write MUST use `q(s)`, and nested calls MUST use the hook's `cms`, or `:memory:` fails with `TRANSACTION_ACTIVE`; `JSON.stringify` turns functions in arrays into `null`, so `/schema` strips `hooks`.

Commit: `docs: describe hooks`

### Task 18: Final verification

1. `pnpm test`: all green.
2. `pnpm typecheck` (no dev watcher running).
3. `pnpm build`.
4. Curl smoke test from `CLAUDE.md` on Astro (`4321`), Nuxt (`3000`) and TanStack Start (`3100`). Delete `cms.db` before and after. Expect 200, 201 and the post in the HTML. A second POST with `{"title":""}` returns 400 with `errors.title`.

## Open risks and spec gaps

- **Behavior change: the local API validates.** Today it stores anything. Server code that relied on that now gets `ValidationError`. HTTP 400 bodies change from `{ error: issues }` to `{ errors }`.
- **`:memory:` concurrency.** A request that arrives while another write's transaction is open fails with `TRANSACTION_ACTIVE`. Tests and demos only.
- **Operation names.** `beforeOperation` `args` shapes (`{ collection, id?, data?, options? }`) and `afterOperation` `result` (what the method returns) are not fixed by the spec. The plan uses them as listed.
- **Missing documents.** `update` / `delete` of a missing id run `beforeOperation` and `afterOperation` only. The spec does not say.
- **Relation id checks** run after the second zod pass (after `beforeChange`), so hooks can set relations. Spec 6's `validate` and `unique` slot in between later.
