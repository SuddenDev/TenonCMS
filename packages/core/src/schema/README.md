# Schema

The content contracts: field options and validators, hook contracts, the types that reads and writes infer, the startup checks and the per-write field processing. Collection and global definitions live in [collections](../collections/README.md) and [globals](../globals/README.md); this module composes their types and processes their fields. The write and read pipelines that call into it live in [content](../content/README.md).

## Follow startup

`defineCms()` calls `checkSchema()` in `validation/check-schema.ts` once, after plugins, settings and media are merged:

`checkSchema()` → `checkRelations()` → `checkJoins()` → `checkFields()` → `checkPreview()` → `dataSchema()`

It checks the populate depth, then each collection and global: references point to known collections with a fitting `onDelete`, joins point back through a relation, `unique` sits where it can work, conditions name known fields and `preview` placeholders name stored fields. Building `dataSchema()` once compiles every `pattern`, so an invalid one throws at startup.

## Follow a write

`content/writes/helpers/prepare-data.ts` runs the field steps in this order:

`runtime/apply-defaults.ts` → `runtime/fill-slugs.ts` → `runtime/run-field-hooks.ts` → `validation/parse-data.ts` → `runtime/validate-fields.ts`

`applyDefaults()` and `fillSlugs()` fill missing values in place. `runFieldHooks()` runs one stage of field hooks, a group's own before its fields'. `parseData()` builds `dataSchema()` from the actual data, because conditions depend on it, and throws a `ValidationError` by field path. `validateFields()` runs the custom `validate` functions of active fields. The pipeline parses again after `beforeChange`, so hooks cannot store invalid data.

## Files

| Path                              | Responsibility                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                        | Type barrel for fields, hooks, inferred types and feature configuration, plus the define helpers.                             |
| `condition.ts`                    | Import-free condition evaluation, shared with the browser admin.                                                              |
| `config/types.ts`                 | `Schema`, composed from collections and globals.                                                                              |
| `endpoints/read.endpoint.ts`      | `GET /schema` for the admin, without hooks or functions.                                                                      |
| `fields/`                         | One field type and validator per file. `index.ts` composes `Field`, `Fields`, `RefField`.                                     |
| `fields/field-schema.ts`          | Picks the validator of one stored field that is not a group.                                                                  |
| `hooks/`                          | Hook contracts for fields, collections, globals, root and media. `HookArgs.cms` is the `LocalApi` of [cms](../cms/README.md). |
| `inference/common.ts`             | Shared type helpers: `Simplify`, `Replace`, `Keys`, `FieldsOf`.                                                               |
| `inference/data.ts`               | Stored `Data` and `Doc`, metadata, populated `File` and `Image`, `FilterKey`.                                                 |
| `inference/check-refs.ts`         | `CheckRefs`: compile-time checks of relation targets and join paths.                                                          |
| `inference/read.ts`               | `Resolve`, `Read` and `ReadDoc`: read results after `populate` and `select`.                                                  |
| `inference/options.ts`            | `Populate`, `Select`, `ReadOptions`, `Exact` and `Checked`: what read options may name.                                       |
| `validation/check-schema.ts`      | Startup checks.                                                                                                               |
| `validation/build-data-schema.ts` | The write validator for actual data, including conditions and groups.                                                         |
| `validation/parse-data.ts`        | Parses data, strips unknown keys and maps failures to field paths. Drafts check types only.                                   |
| `traversal/each-field.ts`         | Visits stored fields and nested group values in order; skips joins.                                                           |
| `traversal/reference-fields.ts`   | `isRef()` and `targetOf()`: relation, image and file fields and their target collection.                                      |
| `traversal/relation-paths.ts`     | Reference fields with their key paths through groups.                                                                         |
| `traversal/field-at.ts`           | The field at a dot path through groups.                                                                                       |
| `traversal/inner-fields.ts`       | The fields inside a group or a populated relation or join.                                                                    |
| `traversal/map-value.ts`          | Applies a function to a document or each document of an array.                                                                |
| `traversal/filterable.ts`         | Which top-level fields `where` accepts.                                                                                       |
| `runtime/apply-defaults.ts`       | Fills missing values, including callable defaults.                                                                            |
| `runtime/fill-slugs.ts`           | Fills empty slugs from their source fields.                                                                                   |
| `runtime/run-field-hooks.ts`      | Runs one stage of field hooks through the shared walker.                                                                      |
| `runtime/validate-fields.ts`      | Runs custom validators with sibling and path context; skips inactive fields.                                                  |
| `runtime/run-hooks.ts`            | `hookList()` flattens a slot; `runHooks()` applies replacements in order.                                                     |

Defaults, slugs, custom validators and field hooks share one `eachField()`. Reference checks and population share `isRef()`, `targetOf()` and `relationPaths()`. Selection and response filtering share `innerFields()` and `mapValue()`.

Browser code MUST import field and schema contracts with `import type`, so zod stays on the server. `condition.ts` MUST stay import-free. The `inference/` types run nothing; after a change there, check both `pnpm typecheck` and the tsdown d.ts build, because the read types sit close to TS2589 and to tsdown's memory limit.
