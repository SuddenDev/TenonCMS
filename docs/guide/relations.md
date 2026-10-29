# Relations

Documents can point to other documents. A `relation` stores ids. A `join` reads the other side.

```ts
author: { type: 'relation', collection: 'authors' }                    // many-to-one
tags: { type: 'relation', collection: 'tags', many: true }             // many-to-many
parent: { type: 'relation', collection: 'pages', onDelete: 'cascade' } // self-reference
posts: { type: 'join', collection: 'posts', on: 'author' }             // one-to-many, on `authors`
```

| Field      | Options                                                                                       | Where                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `relation` | `collection` (target), `many`, `onDelete`, `label`, `required`                                | top level, in groups and in items, in collections and globals; targets collections only |
| `join`     | `collection` (source), `on` (path to a relation there, e.g. `author` or `seo.image`), `label` | top level of collections only; not stored                                               |

## Rules

- Ids live in the document JSON: a string, or a list of strings with `many`.
- A write checks that every id exists in the target collection and that a document does not point at itself (400). A `many` list keeps its order and rejects duplicates. A required `many` relation needs at least one id.
- Typos in `collection` and `join.on` show as type errors in `tenon.config.ts`, naming the path and the allowed values.
- `defineCms` throws at startup for: an unknown target, a `join` whose `on` is not a relation to its own collection, `required` with `onDelete: 'set-null'`, a `join` in a global or group, `cascade` in a global, and `populate.depth` above `populate.maxDepth`.
- Filters accept single top-level relations (`where: { author: id }`). They do not accept `many` relations, relations in groups, or joins.
- `create` and `update` return ids.

## Populate

Reads can resolve relations into documents:

```ts
cms.find("posts"); // every relation, default depth
cms.find("posts", { depth: 1 });
cms.find("posts", { populate: false }); // ids only
cms.find("posts", { populate: { author: { avatar: true }, tags: true } });
cms.find("pages", { populate: { seo: { image: true } } }); // through a group
cms.find("authors", { populate: { posts: true } }); // join
```

- `populate: true` (the default) resolves every relation up to `depth` hops. Group keys do not count as hops.
- A `populate` object resolves only the listed paths. `true` is one hop, a nested object goes further, and `depth` is ignored. `true` on a group key resolves every relation in the group, one hop.
- A `join` resolves only when a `populate` object names it. It returns all matching documents, newest first, with their own relations as ids unless nested paths say otherwise.
- A missing target resolves to `null`, and is dropped from a `many` list. Cycles end at the depth limit.
- Result types follow the options. Invalid `populate` keys are type errors.
- One query runs per relation or join field per hop.

Set the defaults with `defineCms({ populate: { depth: 2, maxDepth: 5 } })`. `depth` applies to `populate: true` (default 2). `maxDepth` limits HTTP requests (default 5). The local API has no limit.

Over HTTP: `?populate=false`, `?populate=author.avatar,tags`, `?depth=3`. The client turns a `populate` object into these paths. Unknown paths, fields that cannot populate, and more hops than `maxDepth` return 400 with the path in the message (`Invalid populate: author.nope`, `Invalid depth: 9`).

## When a document is deleted

Every relation that points to it applies its `onDelete` rule. This all happens in one transaction, with the hooks of the referencing documents:

- `set-null` (the default): a single relation becomes `null`. A `many` list drops the id.
- `restrict` (the default for `required` relations): the delete throws `ConflictError` (exported from `tenoncms`) and changes nothing. HTTP returns 409 with `{ message, references }`, where each reference is `{ collection, id }` or `{ global }`.
- `cascade`: the referencing documents are deleted too, recursively, with their own rules.

Known limits:

- Restrict is checked per document as the cascade reaches it. A `restrict` reference from a document that a later cascade step would delete still blocks the whole delete.
- Joins and delete checks scan the source collection. That is fine up to roughly 10k to 50k documents per collection. Indexes can come later without API changes.
