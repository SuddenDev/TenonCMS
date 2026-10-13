# Array and blocks fields: implementation plan

Spec: `docs/superpowers/specs/2026-10-13-array-blocks-design.md`. Paths are relative to `packages/core/src` unless they start with `packages/` or `examples/`.

Rules for every task:

- TDD: write the test, run it, see it fail for the right reason, then the least code that passes. One test: `npx vitest run <file> -t '<name>'` in `packages/core`.
- After each phase: `pnpm test` and `pnpm -r typecheck` (or `pnpm typecheck` when no watcher runs). After a change to the read types, also run `tsdown` for core (see the `ReadDoc` gotcha in CLAUDE.md).
- Schemas without arrays or blocks MUST behave exactly as now. The existing suite is the regression check.
- Every new host-facing option and enum value gets JSDoc on the property.
- No commits unless asked.

Phases 1 to 4 ship the array on its own. Phases 5 and 6 add blocks on top. Phase 7 is examples and docs.

---

## Phase 1: array field, writes and validation

### 1.1 Type and validator

- `schema/fields/array.ts` (new): `ArrayField` as in the spec.
- `schema/fields/index.ts`: add it to `Field` and the exports. `field-schema.ts`'s `fieldSchema()` excludes `ArrayField` like `GroupField`.
- `schema/traversal/item-fields.ts` (new, type imports only): `itemFields(field, item)` for arrays (blocks in phase 5).
- `schema/validation/build-data-schema.ts`: `fieldEntry()` builds `z.array(item)` for arrays, where `item` is `z.object({ id: z.string().min(1).default(() => crypto.randomUUID()) })` merged with `dataSchema(f.fields, value[i], root, on)`. Per-item schemas need the item value, so build the array check with `z.array(z.unknown()).transform/superRefine` or a `z.tuple` from the current value; pick the form that keeps issue paths positional (`links.2.label`). Add `Duplicate id`, `required` → at least one, `minRows`, `maxRows` when `on`.

Tests (red first):

- `schema/validation/build-data-schema.test.ts`: ids filled; a given id kept; unknown keys stripped in items; positional error path; duplicate id; `required` empty list fails; `minRows`/`maxRows`; a false condition skips them; a condition inside an item reads the item; `/` reads the root; loose (draft) parse still fills ids.

### 1.2 Startup checks

- `schema/validation/check-schema.ts`: item field `id`; join inside an item; `localized: false` inside an item; `unique` inside an item (already top-level only, add a test); `minRows > maxRows` or negative; a `/` condition path through an array. Walk items where groups are walked (`walk()`, `checkFields()`).

Tests: `schema/validation/check-schema.test.ts`, one per rule.

### 1.3 Traversal

- `schema/traversal/each-field.ts`: walk array items with `itemFields()`, prefix `<path>.<i>.`, `siblings` the item.
- `schema/traversal/field-at.ts`: number segments after an array; optional `data` argument (used by blocks later).
- `schema/traversal/filterable.ts`: exclude `array`.
- `schema/inference/data.ts`: `FieldValue` for arrays; `FilterKey` excludes `type: "array"`.

Tests:

- `schema/traversal/each-field.test.ts` (new): visits item fields with positional paths and the item as siblings; `false` skips items; non-array values are skipped.
- `schema/traversal/field-at.test.ts` (new): `links.2.label` finds the field; `links.label` does not.
- `schema/inference/inference.test.ts`: array data type, `FilterKey` excludes it.
- `src/tests/items.test.ts` (new, register it in CLAUDE.md's list of areas): create and update with an array; ids filled and kept across an update; `default` on an item field applies inside new items on create; field hooks (`beforeChange`) run inside items with positional `path`; custom `validate` inside an item reports a positional path; a `slug` inside an item fills from its sibling.

---

## Phase 2: references inside arrays

### 2.1 Paths

- `schema/traversal/relation-paths.ts`: `Each`, `Step`, `relationPaths()` returns `Step[]` and walks arrays (`{ each: true }`). `pathKey()`.
- Update every caller: `content/integrity/check-references.ts`, `content/integrity/find-references.ts` (`path[0]` stays a string), `content/population/populate.ts` (`resolveJoin` finds the join source by `pathKey`), `media/runtime/create-media-core.ts` (`imageFields()` uses `pathKey`), `schema/validation/check-schema.ts` (join `on` MUST NOT match a path with `Each`).
- `schema/traversal/holders-at.ts` (new): `holdersAt(data, path)`.

Tests: `relation-paths.test.ts` (new) for nested groups and arrays; `holders-at.test.ts` (new): one holder per item, positional `at`, missing values skipped, nested arrays.

### 2.2 SQL

- `db/queries/document-sql.ts`: `holdsAt(source, path, many, id)` replaces `holds()`. Nest `json_each` per `Each`; JSON paths as parameters.
- `db/queries/references/referencing-documents.query.ts`, `referencing-global.query.ts`, `referencing-locales.query.ts`: use `holdsAt()`; remove the inline copy.

### 2.3 Integrity

- `content/integrity/check-references.ts`: ids via `holdersAt()`, errors at `at`.
- `content/integrity/apply-on-delete.ts`: `clear()` applies set-null to every holder of `r.path`.

Tests in `src/tests/items.test.ts`:

- an unknown id inside an item fails at `links.1.page`;
- deleting a target: `set-null` clears the field in every item that holds it and keeps the items; a `many` relation in an item drops the id; `restrict` from inside an item answers 409; `cascade` from inside an item deletes the owner;
- the same in a localized collection, in the published data and in a pending locale draft;
- a global with an array referencing a document.

Existing tests in `src/tests/on-delete.test.ts` and `refs.test.ts` MUST stay green.

---

## Phase 3: reads through arrays

- `schema/traversal/inner-fields.ts`: arrays return `fields`.
- `content/population/populate-plan.ts`: `step()` treats `array` like `group`.
- `content/population/populate.ts`: arrays populate `fields` over all items of all documents (`docs.flatMap(d => Array.isArray(d[key]) ? d[key] : [])`).
- `content/population/select-fields.ts`: `pick()` maps items, keeps `id` in each item.
- `content/population/validate-select.ts`, `http/query/parse-populate.ts`, `http/query/parse-select.ts`: arrays count no hop, like groups.
- `http/strip-private-fields.ts`: strip inside items.
- `schema/inference/read.ts`: `FieldReadValue` for arrays. `schema/inference/options.ts`: `Populate` and `Select` accept array keys with group rules.
- `client/types/schema.ts`: `HttpGroup` recurses into array `fields`.

Tests:

- `populate-plan.test.ts`, `select-fields.test.ts`, `validate-select.test.ts`, `parse-populate.test.ts`, `parse-select.test.ts`: array cases.
- `inference.test.ts`: read type of a populated relation inside an array; `select` on item fields; `@ts-expect-error` on an unknown item key.
- `src/tests/items.test.ts`: default depth resolves relations and images inside items (with `src`/`srcset`); a populate object; `select` keeps item ids; HTTP `?populate=links.page` and `?select=links.label`; a private item field is missing from a public read and present with a session.

Check `pnpm typecheck` and core's `tsdown` here.

---

## Phase 4: array in the admin and the preview

### 4.1 Admin

- `packages/admin/src/modules/documents/items.ts` (new) with `items.test.ts`: `newItem()`, `moveItem()`, `duplicateItem()` (fresh ids at every depth), `itemTitle()`.
- `components/ItemList.vue` (new): rows, collapse, menu, native drag, add button, `maxRows`, row opens on an error or `focusKey` inside it.
- `components/FieldInput.vue`: `array` → `ItemList.vue`.
- `components/DocForm.vue`: top-level array as its own card; `normalize()` recurses into items.
- `fields.ts`: `titleField()` skips `array`; `isEmpty()` for `[]`.
- `modules/preview/views/Preview.vue`: `withMedia()` walks items.

### 4.2 Preview runtime

- `preview/runtime/merge-draft.ts`: recursive merge, items matched by `id`, equal ids keep the populated value at any depth.
- Tests in `merge-draft.test.ts`: reordered items keep their populated relations; a changed id in an item takes the draft; a group with an unchanged relation keeps it.

Verify by hand in the standalone example (array on `posts`, see 7.1, or a temporary field): add, reorder, remove, duplicate, save, reload; errors open their row.

---

## Phase 5: blocks in core

- `schema/fields/blocks.ts` (new): `Block`, `BlocksField`; add to `Field`. `Block.icon` is `IconName` (type import from `admin/icons.d.ts`).
- `schema/traversal/item-fields.ts`: blocks by `blockType`.
- `build-data-schema.ts`: block item = `{ id, blockType }` + the block's fields; unknown block fails at `<path>.<i>.blockType`.
- `check-schema.ts`: `blockType` field inside a block; empty `blocks`; all phase 1 rules inside blocks.
- `relation-paths.ts`: `{ each: true, blockType }` per block; `holdersAt()` and `holdsAt()` filter by `blockType`.
- `inner-fields.ts`: blocks return `blockGroups(f)`. `step()`: blocks like groups. `populate()`: per block. `pick()`: by `spec[item.blockType]`. `strip-private-fields.ts`: per item.
- `field-at.ts`: blocks with `data`. `admin/load/field-target.ts`: pass the owner data.
- Types: `data.ts` union, `read.ts`, `options.ts` (block names as keys), `client/types/schema.ts`.

Tests: the phase 1 to 3 cases again for blocks in `src/tests/items.test.ts` (a `describe("blocks")`), plus narrowing on `blockType` in `inference.test.ts`, a select that names one block (others keep `{ id, blockType }`), a populate keyed by block name, and the SQL block filter (a relation with the same key in two blocks, only one targets the deleted collection).

---

## Phase 6: blocks in the admin

- `items.ts`: `newItem(field, blockType)`.
- `ItemList.vue`: block label in the header; add dropdown (icon, label, description); body uses the block's fields; unknown block shows a notice and keeps the data.
- `DocForm.vue` / `normalize()`: blocks through `itemFields()`.
- `Preview.vue` `withMedia()`: blocks.

Verify by hand in the Astro example (7.1).

---

## Phase 7: examples and docs

### 7.1 Examples

- `examples/standalone/collections/posts.ts`: `links` array (`label`, `url`).
- `examples/astro/collections/pages.ts`: `content` blocks (`hero`: `title`, `image`; `text`: `body`). The catch-all renders them with `edit()` bindings (`content.<i>.title`) and narrows on `blockType`.
- Smoke test (isolated DB and uploads, see memory): create a page with blocks over HTTP, read it with `?populate=content.hero.image`, open the page.

### 7.2 Docs

- README: field table rows for `array` and `blocks`; a "Lists and blocks" section (schema, stored shape, ids, `blockType`, populate/select, narrowing, limits from "Out of scope").
- CLAUDE.md: `schema/fields/`, `schema/traversal/` (`itemFields`, `holdersAt`, `Step`), `db/` (`holdsAt`), `content/population/`, admin (`ItemList.vue`, `items.ts`), the `items` test area.
- Module READMEs under `schema/`, `content/`, `db/`.

Final check: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
