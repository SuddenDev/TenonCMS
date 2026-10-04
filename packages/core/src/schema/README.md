# schema

Content contracts, startup checks and per-write field processing. Feature configuration lives in collections/globals/preview; this module composes their types and processes their fields. It depends on the field validators, import-free condition helpers, render helpers and preview template parsing.

| Path                              | Responsibility                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `index.ts`                        | Compatibility barrel for feature configuration, definition helpers, fields, hooks and inferred types. |
| `config/types.ts`                 | The schema contract composed from collections and globals.                                            |
| `fields/`                         | Field options and validators; `index.ts` exports their types.                                         |
| `fields/field-schema.ts`          | Dispatch one stored scalar/reference field to its validator.                                          |
| `hooks/`                          | Hook and local API contracts for fields, collections, globals, root and media.                        |
| `inference.ts`                    | Stored data, document metadata, relation checks and populated/selected read types. Type-only.         |
| `validation/check-schema.ts`      | Startup checks for relations, joins, conditions, uniqueness, patterns, preview paths and depth.       |
| `validation/build-data-schema.ts` | Build a write validator from actual data, including conditions and groups.                            |
| `validation/parse-data.ts`        | Parse data, strip unknown keys and map validation failures to field paths. Drafts check types only.   |
| `traversal/each-field.ts`         | Visit stored fields and nested group values in order; skip joins.                                     |
| `traversal/reference-fields.ts`   | Identify relation/image/file fields and their target collections.                                     |
| `traversal/relation-paths.ts`     | Find reference paths through groups.                                                                  |
| `traversal/field-at.ts`           | Resolve a field at a dot path through groups.                                                         |
| `traversal/inner-fields.ts`       | Find fields inside a group or populated relation/join.                                                |
| `traversal/map-value.ts`          | Apply document processing to objects and arrays.                                                      |
| `traversal/filterable.ts`         | Check which top-level fields support filters.                                                         |
| `runtime/apply-defaults.ts`       | Fill missing values, including callable defaults.                                                     |
| `runtime/fill-slugs.ts`           | Fill empty slugs from their source fields.                                                            |
| `runtime/validate-fields.ts`      | Run custom validators with sibling/path context and condition checks.                                 |
| `runtime/run-field-hooks.ts`      | Run field hooks through the shared walker; group hooks precede children.                              |
| `runtime/run-hooks.ts`            | Flatten hook slots and apply replacements in declared order.                                          |
| `condition.ts`                    | Import-free condition evaluation, shared with the browser admin.                                      |

`checkSchema()` runs during instance construction. `dataSchema()` is built for each write because conditions depend on current values. The content write pipeline parses twice, around `beforeChange`, so hooks cannot persist invalid data.

Defaults, slugs, custom validators and field hooks share one `eachField()` implementation. Reference checks/population share reference classification and path traversal. Selection and response filtering share `innerFields()` and `mapValue()`.

Browser code MUST import field and schema contracts with `import type`. `condition.ts` MUST remain import-free. Public inferred types retain the same names through `index.ts`.
