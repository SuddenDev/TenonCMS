# Hooks

Spec 3 of 5: group field, relation field, hooks, auth hooks, page preset. Requires specs 1 and 2 (hooks see groups, relations and `onDelete`).

## Goal

Host code runs at fixed points of every read, write and delete: to change data, validate across documents, add computed values and react to changes. The hook set follows Payload's collection, global and field hooks, so Payload users feel at home. Presets (spec 5) ship their behavior as hooks the host can see, omit and replace.

## Where hooks live

```ts
defineCollection({ fields, hooks: { beforeChange: [...], afterRead: {...} } })
defineGlobal({ fields, hooks: { ... } })
fields: { title: { type: 'text', hooks: { beforeChange: [...] } } }
defineCms({ ..., hooks: { afterError: [...] } })
```

Each slot takes an array or a named record of functions. Core normalizes with `Object.values`; key order is run order. Presets MUST ship records, so hosts can omit a hook by name:

```ts
const { uniqueSlug, ...rest } = page.hooks.beforeChange
hooks: { beforeChange: { ...rest, fillSeo } }
```

## Hook set

| Hook | Collection | Global | Field | Root |
|---|---|---|---|---|
| `beforeOperation` | ✓ | | | |
| `beforeValidate` | ✓ | ✓ | ✓ | |
| `beforeChange` | ✓ | ✓ | ✓ | |
| `afterChange` | ✓ | ✓ | ✓ | |
| `beforeRead` | ✓ | ✓ | | |
| `afterRead` | ✓ | ✓ | ✓ | |
| `beforeDelete` | ✓ | | | |
| `afterDelete` | ✓ | | | |
| `afterOperation` | ✓ | | | |
| `afterError` | ✓ | | | ✓ |

## Where hooks run

On every local API call. HTTP routes and the admin call the local API, so hooks run for them too. Operations: `create`, `update`, `delete`, `read` (`find`, `findOne`, `findById`), `getGlobal`, `setGlobal`.

## Order

Write (`create`, `update`, `setGlobal`):

```
beforeOperation → beforeValidate → validate (zod) → beforeChange
→ DB write → afterChange → afterRead → afterOperation
```

Read: `beforeOperation → beforeRead → populate → afterRead → afterOperation`.

Delete: `beforeOperation → beforeDelete → delete + onDelete effects → afterDelete → afterOperation`.

At each stage, field hooks run first, in field order and depth-first into groups, then collection or global hooks.

`beforeValidate` receives unvalidated input. Its result is validated. `beforeChange` receives validated data; its result MUST pass validation again before the write, so a hook cannot store invalid data.

## Arguments and return values

Every hook gets one object. A hook MAY return a replacement for its main value; returning `undefined` keeps the input. Hooks MAY be async.

| Hook | Main value | Other arguments |
|---|---|---|
| `beforeOperation` | `args` (the operation's input) | `operation` |
| `beforeValidate`, `beforeChange` | `data` | `operation`, `id`, `originalDoc` |
| `afterChange` | `doc` | `operation`, `previousDoc` |
| `beforeRead`, `afterRead` | `docs` (array) | `operation` |
| `beforeDelete` | none | `id`, `doc` |
| `afterDelete` | none | `id`, `doc` |
| `afterOperation` | `result` | `operation`, `args` |
| `afterError` | none | `error`, `operation`, `collection` |
| field hooks | `value` | `data`, `siblingData`, `originalDoc`, `path` (e.g. `seo.title`), `operation` |

All hooks also get:

- `cms`: the local API, bound to the current transaction. Nested calls run their own hooks.
- `user`: the session user, or `null` for public reads and server-side local API calls.
- `context`: one plain object shared by all hooks of an operation and every nested call inside it. Hooks use it to pass values along and to stop loops.
- `collection` or `global`: the name.

Field `afterRead` runs once per value. Collection and global `beforeRead` / `afterRead` run once per batch.

### Types

`data`, `doc`, `docs`, `value` and `originalDoc` are typed from the fields of the collection, global or field the hook belongs to. Inference from hooks inside the same `defineCollection` literal MUST be covered by a typecheck test.

## Populated documents

Documents loaded by `populate` run through their own collection's `beforeRead` and `afterRead`, batched per collection per hop. `context` is shared with the outer read.

## Errors

- `ValidationError` is exported from `integral-cms`: `throw new ValidationError({ slug: 'Already used on this level' })`. Keys are field paths. HTTP returns 400 with `{ errors: { [path]: message } }`. The admin shows each message next to its field.
- Any other error rolls back the transaction, runs collection `afterError`, then root `afterError`, and is rethrown. HTTP returns 500 without the message.
- An error inside `afterError` is logged and does not replace the original error.

## Transactions

- On libsql (and Postgres later), every write operation runs in one interactive transaction: the write, its hooks, `onDelete` effects and nested `cms` calls. An error rolls back all of it.
- On drivers without interactive transactions (Cloudflare D1 later), hooks run in the same order without isolation. The docs MUST say so.
- Reads do not open a transaction. A read nested in a write uses the write's transaction.

## Loops

A hook that writes to its own collection triggers its own hooks again. Core does not prevent this; hooks use `context` to stop it, as in Payload. Tests MUST show the pattern.

## Out of scope

- `beforeDuplicate`: comes with a duplicate operation
- Auth hooks: spec 4
- Access control hooks: roadmap #6
- Typing keys a hook adds to documents (e.g. `path`): spec 5

## Tests (TDD: write each test, run it RED, then make it GREEN)

`app.test.ts`:

- order: every hook appends its name to an array; assert the full order for write, read and delete, including field before collection
- array and record forms produce the same order
- a returned value replaces the input at each stage; `undefined` keeps it
- `beforeChange` result is validated again: invalid data returns 400
- `ValidationError` returns 400 with field errors
- a thrown error rolls back the write and a nested `cms` write, runs collection then root `afterError`, and HTTP returns 500 without the message
- `afterRead` runs once per `find` with all docs, and once per collection per hop for populated docs
- field hooks inside groups receive `path: 'seo.title'`
- `context` is shared with nested calls; a hook writing to its own collection stops via `context`
- `user` is set for authenticated HTTP writes and `null` for public reads

`schema.test.ts`:

- hook argument types inferred from the fields in the same `defineCollection` call, with `@ts-expect-error` on an unknown field
