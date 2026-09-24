# Relation and join fields

Spec 2 of 6: group field, relation field, hooks, auth, page preset, field options. Execution order: 4, 1, 2, 3, 6, 5. Requires the group field (spec 1).

## Goal

Documents reference other documents: m-1 (post → author), 1-m (author → posts, read side), m-m (post ↔ tags), and self-references (page → parent page). Reads resolve references into documents in a controlled, typed way. Deleting a referenced document never breaks the referencing ones by default.

## Fields

```ts
// stored
author: { type: 'relation', collection: 'authors' }
tags: { type: 'relation', collection: 'tags', many: true }
parent: { type: 'relation', collection: 'pages', onDelete: 'cascade' }

// virtual, the inverse side
posts: { type: 'join', collection: 'posts', on: 'author' }
```

| Cardinality | How |
|---|---|
| m-1 | `relation` on the "many" side |
| 1-m | the same `relation`, read from the other side with a `join` |
| m-m | `relation` with `many: true`; `join` for the other side |
| 1-1 | `relation`; uniqueness is not enforced in v1 |

### `relation`

- Options: `collection` (target), `many?: boolean`, `onDelete?: 'set-null' | 'restrict' | 'cascade'`, and the usual `label`, `required`.
- Allowed at the top level and inside groups, in collections and in globals.
- Targets are collections only.
- A required `many` relation MUST hold at least one id.

### `join`

- Options: `collection` (source), `on` (dot path to a `relation` field in the source collection, e.g. `author` or `seo.image`), `label`.
- Allowed at the top level of collections only. Not stored; writes strip it.
- `required` and `onDelete` do not apply.

### Checked in `defineCms`

`defineCms` MUST throw at startup when:

- a `relation` targets a collection that does not exist;
- a `join`'s `on` does not resolve to a `relation` field in its source collection that targets the join's own collection;
- a `relation` has `required: true` and `onDelete: 'set-null'`;
- a `join` appears in a global or inside a group;
- a `relation` inside a global has `onDelete: 'cascade'` (a global cannot be deleted);
- the config's `populate.depth` is above `populate.maxDepth`.

## Storage

Ids live in the document JSON, like every other value: a string for a single relation, a string array for `many`. No new table, no migration.

Known ceiling: reverse lookups (`join`, delete scans) scan the source collection. Expected to be fine up to roughly 10k–50k documents per collection. Upgrade path: SQLite expression indexes for single relations, a derived relations index table for `many`. Neither changes the API.

## Writes

- Every id MUST exist in the target collection, else 400. One `IN (...)` query per relation field.
- `many` arrays MUST NOT contain duplicates, else 400. Order is kept.
- A document MUST NOT reference itself, else 400.
- `create` and `update` return ids, not populated documents.

## Reads: `populate` and `depth`

Applies to `find`, `findOne`, `findById` and `getGlobal`, in the local API and the client.

```ts
cms.find('posts')                                        // populate all, default depth
cms.find('posts', { depth: 1 })
cms.find('posts', { populate: false })                   // ids only
cms.find('posts', { populate: { author: { avatar: true }, tags: true } })
cms.find('pages', { populate: { seo: { image: true } } }) // through a group
cms.find('authors', { populate: { posts: true } })       // join
```

- `populate: true` (default) resolves every `relation` up to `depth` hops. Group keys do not count as hops.
- `populate: { ... }` resolves only the listed paths. `true` resolves one hop; a nested object goes further along that path only. `depth` is ignored.
- `true` on a group key (`populate: { seo: true }`, `?populate=seo`) resolves every relation in that group one hop.
- `populate: false` returns ids.
- `join` fields populate only when named in a `populate` object, never through `populate: true`. An unnamed `join` field is absent from the result.
- Unresolved relations stay ids. A missing target resolves to `null`; in a `many` relation it is dropped from the array.
- A populated `join` returns all matching documents, newest first, each populated like a `populate: false` read unless nested paths say otherwise.
- Cycles end at the depth limit.
- Batched: one query per relation or join field per hop, never one per document.

### Config

```ts
defineCms({ ..., populate: { depth: 2, maxDepth: 5 } })
```

- `depth`: default for `populate: true`. Default 2.
- `maxDepth`: limit for HTTP requests only. Default 5. The local API has no limit.

### HTTP

- `?populate=false`, `?populate=author.avatar,tags`, `?depth=3`.
- The client serializes a `populate` object to dot paths; the server parses them back into the same object.
- Every path segment MUST be a group, `relation` or `join` field of the schema, else 400.
- `?depth` above `maxDepth`, or a path with more relation hops than `maxDepth`, returns 400.

### Types

- Relation values are typed by what the read resolves: `Doc<Target>` (or `Doc<Target>[]` for `many`) where populated, `string` / `string[]` where not. Optional relations include `null`.
- The default depth comes from the config's `populate.depth` literal, falling back to 2.
- A `populate` object is checked against the fields at every level. Invalid keys MUST fail to compile.
- `join` fields appear in the result type only when named in `populate`.

## Filters

- `where: { author: id }` works for single top-level relations, as today.
- `many` relations, relations inside groups and `join` fields are not filterable in v1.

## Delete: `onDelete`

When a document is deleted, every relation in every collection and global that targets its collection is checked. All effects run in one transaction.

- `set-null` (default): a single relation becomes `null`; the id is removed from a `many` array.
- `restrict` (default when `required: true`): the delete throws `ConflictError` and changes nothing. HTTP returns 409 and lists the references: `{ collection, id }` for a document, `{ global }` for a global.
- `cascade`: the referencing documents are deleted too, recursively, with their own `onDelete` rules. A visited set ends cycles.

`ConflictError` is exported from `integral-cms`. It lives in `src/errors.ts`, which MUST have no imports, so code that runs in the browser (presets, spec 5) can import errors without pulling in zod. Spec 3 adds `ValidationError` to the same file.

Known gap: restrict is checked per document, as the cascade reaches it. A `restrict` reference from a document that a later cascade step would delete still blocks the whole delete. A two-phase check (collect the full cascade first) would fix it; it is not planned.

## Admin

- `relation`: `<select>` for single, multi-select for `many`. Options come from `find(collection, { populate: false })`, labeled by the target's `titleField`, falling back to the id.
- `join`: read-only list of linked documents on the edit page.
- The edit page reads with `populate: false`, so the form holds ids.
- Out of v1: search and pagination in the selects.

## Out of scope

- Polymorphic relations (`collection: ['a', 'b']`)
- Uniqueness (strict 1-1)
- Filters on `many` relations, relations inside groups and `join` fields
- Pagination or `limit` on `join` and `many` (a later long-form `populate` option)
- Per-relation `where` / field selection

## Tests (TDD: write each test, run it RED, then make it GREEN)

- `schema.test.ts`: validation of relation values (single, `many`, duplicates, empty required `many`); populate result types for default depth, explicit depth, nested objects, groups (also `{ seo: true }`) and joins; `@ts-expect-error` for invalid populate keys.
- `app.test.ts`:
  - startup errors for each `defineCms` check;
  - writes: unknown id 400, self-reference 400;
  - reads over HTTP: default populate, `depth`, `populate` paths through groups, `true` on a group key, `populate=false`, join, missing target as `null`, `maxDepth` 400, invalid path 400;
  - delete: `set-null` on single and `many`, `restrict` 409 with nothing changed and a global listed as `{ global }` (the local API throws `ConflictError`), `cascade` recursive and over a cycle.
