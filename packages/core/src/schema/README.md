# schema

Everything about how content is described. A host writes collections and globals; this folder types them, checks them at startup and validates each write.

| Path              | What it does                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`        | Compatibility barrel for feature configuration, identity helpers, fields, hooks and inferred types.                                                                                  |
| `config/types.ts` | The `Schema` contract, composed from collection and global contracts.                                                                                                                |
| `fields/`         | One file per field type: its options and its zod validator. `index.ts` builds the `Field` union. `image` and `file` store media ids like `relation`.                                 |
| `hooks/`          | Hook types per level (field, collection, global, root) and media hooks with the `cms.media` API type. `run.ts` runs a list of hooks in order.                                        |
| `types.ts`        | Type-level only: the document type of a schema with its meta (`publishedAt`, `hasDraft` too), valid `populate` / `select` paths, and the typed result of a read.                     |
| `validate.ts`     | `checkSchema()` at startup (bad relations, conditions, `unique`, `preview` placeholders, …). `parseData()` validates one write with zod; `loose` checks types only, for draft saves. |
| `walk.ts`         | Loops over fields and data: defaults, slugs, custom `validate`, field hooks, path lookups. `isRef()` / `targetOf()` cover `relation`, `image`, `file`.                               |
| `condition.ts`    | `matchCondition()`: when a field is active. No imports, because the admin bundles it too.                                                                                            |

Browser code MUST import field types with `import type`: the field files import zod.

Collection definitions live in `../collections/config/`, global definitions in `../globals/config/`, and preview configuration in `../preview/config/types.ts`.
