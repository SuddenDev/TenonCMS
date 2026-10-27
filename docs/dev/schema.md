# Schema, validation and types

Code: `packages/core/src/schema/` (see its README).

## Definitions are plain objects

- A field, collection or global is a plain object. Helpers such as `defineCollection()` only keep the literal types.
- Admin-only options (`label`, `description`, `nav`, `visualEditing`, `readOnly`, `layout`) change nothing on the server.
- Layout options (tabs, fieldsets, widths) are only read by the admin. A startup check makes sure they name real tabs and fieldsets.

## Two kinds of validation

**At startup**, one check walks the whole schema and throws for mistakes: unknown relation targets, bad joins, conditions on missing fields, misplaced `unique` or `localized`, bad patterns, bad preview placeholders, bad localization config, bad list limits.

**On every write**, a validator is built from the data being written. It cannot be built once at startup, because conditions depend on values: an inactive field skips `required` and the built-in checks but still gets its type checked.

- Unknown keys are stripped. Errors come back keyed by field path (`links.2.label`).
- Draft saves use loose, type-only checks. Publishing runs the full pipeline.
- Lists (`array`, `blocks`) are validated item by item, so error paths stay positional and conditions inside an item read that item. Every item gets an `id`. A block item MUST name a known block, even in a draft.

## Shared traversal

A few helpers walk the fields of a document, so every feature agrees on what a path means. Do not write another walk.

- One value walker visits fields in order, into groups and into each list item. Defaults, slugs, field hooks, custom `validate` and field access use it.
- Reference checks, `onDelete` effects and reverse lookups use relation paths. Population, `select` and response filtering use the inner-field helpers.
- The write validator is built from the data itself and follows the same rules for groups and items.
- A relation path through a list has "each item" steps. Paths print as `links[].page` or `content[hero].image`.
- A condition path MUST NOT cross a list. Joins are never stored, so the walkers skip them.
- Localized fields: a group is one localized key, joins are none, and `localized: false` shares a top-level field.

## Conditions and JSON

Anything the admin evaluates MUST be JSON: conditions, the built-in checks and plain defaults. They run in both places. `validate`, function defaults and hooks run on the server only, so the schema sent to the admin has them stripped.

## Hook contracts

- The schema folder only holds the types of hooks. Running them is the content engine's job.
- Hook functions use method syntax on purpose. That keeps hook arguments bivariant, so a collection with typed hooks is still assignable to the generic `Collection`.
- A hook stage is an array or a record of named functions. They are flattened and run in order. A returned value replaces the main value; `undefined` keeps it.

## Type inference

Types are a big part of the product: reads, populate and select all change the result type.

- Inference lives in type-only files, one per concern: stored data, read results, populate and select, checked references, locale.
- Keep recursion guarded for untyped schemas (the admin uses one), or TypeScript fails with "excessively deep" errors.
- Generic inference skips excess property checks, so option objects need an `Exact` wrapper to reject unknown keys.
- **After any change to read types or locale types, run both `pnpm typecheck` and the `tsdown` build.** Some mistakes pass one and break the other.
- Keep type tests for success and for rejection.
