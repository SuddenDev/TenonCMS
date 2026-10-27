# Schema

`date` fields store ISO calendar dates; `datetime` fields store UTC ISO timestamps. The admin edits timestamps in the browser’s local timezone.

The content contracts: field options and validators, hook contracts, the types that reads and writes infer, the startup checks and the per-write field processing. Collection and global definitions live in [collections](../collections/README.md) and [globals](../globals/README.md); this module composes their types and processes their fields. The write and read pipelines that call into it live in [content](../content/README.md).

## Follow startup

`defineCms()` calls `checkSchema()` in `validation/check-schema.ts` once, after plugins, settings and media are merged:

`checkSchema()` → `checkLocalization()` → `checkRelations()` → `checkJoins()` → `checkFields()` → `checkPreview()` → `checkLocalized()` → `dataSchema()`

It checks the `localization` config (not empty, no duplicates, `defaultLocale` in `locales`) and the populate depth, then each collection and global: references point to known collections with a fitting `onDelete`, joins point back through a relation, `unique` sits where it can work, conditions name known fields, `preview` and `permalink` placeholders name stored fields (`{locale}` only with `routing: false`), and `localized` fits: it needs the `localization` option, `localized: false` on a field only sits at the top level of a localized collection or global, and `media` cannot be localized. Array and block items reserve `id` (and `blockType`), hold no joins, `unique` or `localized`, and a join `on` or a condition path never crosses a list; `blocks` is not empty and `minRows`/`maxRows` fit. Building `dataSchema()` once compiles every `pattern`, so an invalid one throws at startup.

## Follow a write

`content/writes/prepare-data.ts` runs the field steps in this order:

`runtime/apply-defaults.ts` → `runtime/fill-slugs.ts` → `runtime/run-field-hooks.ts` → `validation/parse-data.ts` → `runtime/validate-fields.ts`

`applyDefaults()` and `fillSlugs()` fill missing values in place. `runFieldHooks()` runs one stage of field hooks, a group's or list's own before its fields'. All three walk array and block items with positional paths (`links.2.label`). `parseData()` builds `dataSchema()` from the actual data, because conditions depend on it and a block item's fields depend on its `blockType`, and throws a `ValidationError` by field path. It fills a missing item `id`, drafts included. `validateFields()` runs the custom `validate` functions of active fields. The pipeline parses again after `beforeChange`, so hooks cannot store invalid data.

## Files

| Path                                 | Responsibility                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`                           | Type barrel for fields, hooks, inferred types and feature configuration, plus the define helpers.                                                                        |
| `condition.ts`                       | Import-free condition evaluation, shared with the browser admin.                                                                                                         |
| `config/types.ts`                    | `Schema`, composed from collections and globals.                                                                                                                         |
| `endpoints/read.endpoint.ts`         | `GET /schema` for the admin, without hooks or functions. Adds `localization` (`locales`, `defaultLocale`) and reports `preview: true` for a `permalink`.                 |
| `endpoints/localization.endpoint.ts` | `GET /localization`: the normalized `localization` option, or `null`. Public.                                                                                            |
| `fields/`                            | One field type and validator per file. `index.ts` composes `Field`, `Fields`, `RefField`. `array.ts` and `blocks.ts` hold types only.                                    |
| `fields/field-schema.ts`             | Picks the validator of one stored field that is not a group, an array or a blocks field.                                                                                 |
| `hooks/`                             | Hook contracts for fields, collections, globals, root and media. `HookArgs.cms` is the `LocalApi` of [cms](../cms/README.md); `HookArgs.locale` is the call's locale.    |
| `inference/common.ts`                | Shared type helpers: `Simplify`, `Replace`, `Keys`, `FieldsOf`.                                                                                                          |
| `inference/data.ts`                  | Stored `Data` and `Doc`, metadata, populated `File` and `Image`, `FilterKey`. Array items have an optional `id`; blocks are a union keyed by `blockType`.                |
| `inference/check-refs.ts`            | `CheckRefs`: compile-time checks of relation targets and join paths.                                                                                                     |
| `inference/read.ts`                  | `Resolve`, `Read` and `ReadDoc`: read results after `populate` and `select`. Read items always have `id`; a block the select does not name reads as `{ id, blockType }`. |
| `inference/options.ts`               | `Populate`, `Select`, `ReadOptions`, `Exact` and `Checked`: what read options may name, including `locale`, `fallback` and `alternates`.                                 |
| `inference/locale.ts`                | `Locale`, `LocaleMeta`, `GlobalLocaleMeta` and `AlternatesOf`: locale codes and locale metadata of reads.                                                                |
| `validation/check-schema.ts`         | Startup checks.                                                                                                                                                          |
| `validation/build-data-schema.ts`    | The write validator for actual data, including conditions, groups and `itemsSchema()`: item ids, `blockType`, duplicate ids, `required`/`minRows`/`maxRows`.             |
| `validation/parse-data.ts`           | Parses data, strips unknown keys and maps failures to field paths. Drafts check types only.                                                                              |
| `traversal/each-field.ts`            | Visits stored fields, nested group values and array and block items (prefix `<path>.<index>.`) in order; skips joins.                                                    |
| `traversal/reference-fields.ts`      | `isRef()` and `targetOf()`: relation, image and file fields and their target collection.                                                                                 |
| `traversal/relation-paths.ts`        | `relationPaths()`: reference fields with `Step[]` paths through groups and items (`Each`, one path per block). `pathKey()` and `plainPath()` render them.                |
| `traversal/item-fields.ts`           | `itemFields()`: the fields of one array or block item. Type imports only; the admin bundles it.                                                                          |
| `traversal/holders-at.ts`            | `holdersAt()`: every `{ parent, key, at }` a `Step[]` path reaches in a value, with the positional path.                                                                 |
| `traversal/field-at.ts`              | The field at a dot path through groups and items (`links.2.label`); a block item needs the data.                                                                         |
| `traversal/inner-fields.ts`          | The fields inside a group, an array item or a populated relation or join; `blockGroups()` gives blocks as one group per block name.                                      |
| `traversal/map-value.ts`             | Applies a function to a document or each document of an array.                                                                                                           |
| `traversal/filterable.ts`            | Which top-level fields `where` accepts.                                                                                                                                  |
| `traversal/localized-fields.ts`      | `localizedKeys()`: the top-level keys stored in locale rows. A group, an array or a blocks field is one key; joins are none.                                             |
| `runtime/apply-defaults.ts`          | Fills missing values, including callable defaults.                                                                                                                       |
| `runtime/fill-slugs.ts`              | Fills empty slugs from their source fields.                                                                                                                              |
| `runtime/run-field-hooks.ts`         | Runs one stage of field hooks through the shared walker.                                                                                                                 |
| `runtime/validate-fields.ts`         | Runs custom validators with sibling and path context; skips inactive fields.                                                                                             |
| `runtime/run-hooks.ts`               | `hookList()` flattens a slot; `runHooks()` applies replacements in order.                                                                                                |

Defaults, slugs, custom validators and field hooks share one `eachField()`. Reference checks and population share `isRef()`, `targetOf()` and `relationPaths()`; reference checks and `onDelete` effects use `holdersAt()`. Selection and response filtering share `innerFields()`, `itemFields()` and `mapValue()`.

Browser code MUST import field and schema contracts with `import type`, so zod stays on the server. `condition.ts` MUST stay import-free. The `inference/` types run nothing; after a change there, check both `pnpm typecheck` and the tsdown d.ts build, because the read types sit close to TS2589 and to tsdown's memory limit.

`fields/richtext.ts` declares the standard Tiptap JSON field. The [richtext module](../richtext/README.md) owns its shared schema, feature policy, embedded relations and read decoration.
