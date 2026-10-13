# Array and blocks fields: design

Status: approved for a first implementation. Decisions marked **(revisit)** are guesses to test in use.

## Goal

Two new field types:

- `array`: a list of items that all share one set of fields (a repeater).
- `blocks`: a list of items where each item picks its fields by a block name.

Both share one item model, so every layer handles "items" once and blocks add only the per-item field choice. The array ships first and works on its own; blocks follow and reuse it.

## Decisions

- Every item has a stable `id` in the stored JSON. The server fills a missing one; the admin creates one for new rows.
- A block item stores its block name in `blockType`, like Payload.
- Options follow Payload: `minRows`, `maxRows`, `labels: { singular, plural }`; `required` means at least one item.
- `blocks` is a record keyed by block name, like `Fields`.
- Paths use positions: `content.2.title` in errors, conditions, `edit()` and `focusKey`. The `id` is for identity only.
- Storage stays one JSON document (approach A). No migration.
- Arrays and blocks MAY nest in groups, arrays and blocks.
- Not filterable. No `unique` inside items. No joins inside items.
- In a localized entry, a top-level array or blocks field is one localized key. Fields inside items MUST NOT set `localized: false`.

## 1. Schema, stored shape, validation

### Field types

`schema/fields/array.ts`:

```ts
export type ArrayField = Base<Record<string, any>[]> & {
  type: "array";
  fields: Fields;
  minRows?: number;
  maxRows?: number;
  labels?: { singular?: string; plural?: string };
};
```

`schema/fields/blocks.ts`:

```ts
export type Block = { label?: string; description?: string; icon?: IconName; fields: Fields };
export type BlocksField = Base<Record<string, any>[]> & {
  type: "blocks";
  blocks: Record<string, Block>;
  minRows?: number;
  maxRows?: number;
  labels?: { singular?: string; plural?: string };
};
```

Both join `Field` in `schema/fields/index.ts`. Every option gets JSDoc on the property.

### Stored shape

```json
"links":   [{ "id": "…", "label": "Docs", "url": "/docs" }],
"content": [{ "id": "…", "blockType": "hero", "title": "Hi", "image": "m1" },
            { "id": "…", "blockType": "text", "body": "…" }]
```

`id` is reserved in every item, `blockType` in every block item.

### Inferred types (`schema/inference/data.ts`)

- Array: `({ id: string } & Data<F>)[]`.
- Blocks: `{ [K in keyof B]: { id: string; blockType: K } & Data<B[K]["fields"]> }[keyof B][]`, so `item.blockType === "hero"` narrows.
- `FilterKey` excludes both.

### Writes

The item validator fills ids: `id: z.string().min(1).default(() => crypto.randomUUID())`. Every write parses its data (drafts too, in `content/writes/helpers/prepare-data.ts`), so items from the input, from `default` and from any hook get an id. Field hooks that run before the first parse (`beforeValidate`) MAY see new items without an id. The draft parse MUST keep the default; a test covers it.

`default` on an array is a list of items; ids are filled like any other item.

### Validation (`schema/validation/build-data-schema.ts`)

- An array value is `z.array` of item objects. Each item is `z.object` of `id: z.string().min(1)` plus `dataSchema(itemFields, item, root, on)`. Unknown keys are stripped.
- A blocks item also has `blockType`. An unknown `blockType` fails at `content.2.blockType` with `Unknown block`.
- Duplicate ids in one list fail at the list's path with `Duplicate id`.
- When the field applies: `required` means `min(1)`; `minRows` and `maxRows` are checked. When it does not apply, only types are checked.
- Inside an item, a plain condition path reads the item; `/` reads the document root.
- Draft saves keep their loose checks.

### Startup checks (`schema/validation/check-schema.ts`)

Fail for: an item field named `id`; a block field named `blockType`; a join inside an item; `localized: false` inside an item; `minRows > maxRows`, or a negative value; an empty `blocks` record; a join `on` path into items; a `/` condition path that crosses an array or blocks field.

## 2. Traversal and references

### Paths with items

`schema/traversal/relation-paths.ts`:

```ts
export type Each = { each: true; blockType?: string };
export type Step = string | Each;
```

`relationPaths()` returns `{ path: Step[]; field }`. The first step is always a top-level key. `pathKey(path)` renders `content[hero].image` (or `links[].url`) for logs and media's `imageFields()`.

### Helpers (`schema/traversal/`)

- `item-fields.ts`, `itemFields(field, item)`: an array's `fields`; for blocks, `blocks[item.blockType]?.fields`. `undefined` for an unknown block or a value that is not an object; walkers skip such items.
- `holders-at.ts`, `holdersAt(data, path)`: every `{ parent, key, at }` that a `Step[]` reaches in one value, expanding items and filtering by `blockType`. `at` is the positional path (`content.2.image`).
- `each-field.ts`: after the visit, an `array` or `blocks` value that is an array is walked item by item with `itemFields()`. The item is `siblings`; the prefix is `<path>.<index>.`. `false` from the visit skips the items too.
- `field-at.ts`, `fieldAt(fields, path, data?)`: a number segment after an array steps into its fields. For blocks it reads `blockType` from `data` at that index; without `data` it returns `undefined`. `admin/load/field-target.ts` passes the owner data.
- `filterable.ts`: excludes `array` and `blocks`.

### SQL (`db/queries/document-sql.ts`)

`holdsAt(source, path, many, id)` replaces `holds()` and the inline copy in `referencing-locales.query.ts`. It nests one `json_each` per `Each`:

```sql
EXISTS (SELECT 1 FROM json_each(<source>, '$.content') i0
        WHERE json_extract(i0.value, '$.blockType') = ?
          AND json_extract(i0.value, '$.image') = ?)
```

A `many` relation at the end adds one more `json_each`. All JSON paths and block names are parameters. `referencingDocs`, `referencingGlobal` and `referencingLocales` use it.

### Integrity

- `checkRefs()` collects ids through `holdersAt()` and fails at the positional path.
- `references()` keeps one `Ref` per owner row. `clear()` in `apply-on-delete.ts` applies `set-null` to every holder in the row's data: a single value becomes `null`, a `many` list drops the id. The item stays.
- `restrict` and `cascade` are unchanged.

## 3. Reads

Arrays and blocks behave like groups in populate and select: they pass the plan through and count no hop.

### Spec shape

- Array: `populate: { links: { page: true } }`, `select: { links: { label: true } }`.
- Blocks: keyed by block name: `populate: { content: { hero: { image: true } } }`, `select: { content: { hero: { title: true }, text: true } }`. A number or `true` on the blocks field passes to every block. **(revisit)**
- HTTP: `?populate=content.hero.image`, `?select=links.label`.

### Runtime

- `innerFields(collections, f)`: an array returns its `fields`; blocks return `blockGroups(f)`, a record of block name to `{ type: "group", fields }`. `validate-select.ts` and `http/query/parse-populate.ts` / `parse-select.ts` then reuse the group rules for both.
- `populate-plan.ts`, `step()`: `array` and `blocks` behave like `group`.
- `populate()`: an array populates `fields` over every item of every document at once. Blocks group the items by `blockType` and populate each block's `fields` with that block's sub-plan. Still one query per field per hop (per block).
- `pick()` (`select-fields.ts`): items always keep `id` (and `blockType`). For blocks, `spec[item.blockType]`: `true` keeps the item, an object picks its fields, a missing key leaves `{ id, blockType }`.
- `http/strip-private-fields.ts`: walks items with `itemFields()`.
- Media decoration during population works per field, as now.

### Types

- `schema/inference/read.ts`: `FieldReadValue` maps an array to `({ id: string } & Resolve<…, F, Spec>)[]` and blocks to the union, each block with `Sub<Spec, K>`.
- `schema/inference/options.ts`: `Populate` and `Select` accept array keys (group rules) and blocks keys (block names, then group rules).
- `client/types/schema.ts`: `HttpGroup` recurses into array `fields` and every block's `fields`, so private fields there are optional.
- Type tests in `schema/inference/inference.test.ts` for each case.

## 4. Admin

### Components (`packages/admin/src/modules/documents/`)

- `components/ItemList.vue`: renders an `array` or `blocks` field.
  - One collapsible row per item, keyed by `id`. Header: drag handle, `labels.singular` (or the block's label) with the position, the item's title (`titleField()` of its fields), and a "…" menu: move up, move down, duplicate (new ids), remove.
  - Body: `FieldInput.vue` for each item field, with path `<path>.<index>.<key>`, `siblings` the item, and `root` the document.
  - Add: an array shows "Add <singular>". Blocks show a dropdown of blocks (icon, label, description). `maxRows` disables it.
  - New rows open; others start collapsed **(revisit)**. A row opens when it holds an error or the `focusKey` path.
  - Reorder: menu items (keyboard accessible) and native drag on the handle.
- `items.ts` (pure, unit-tested): `newItem(field, blockType?)` (`id`, `blockType`, plain defaults), `moveItem()`, `duplicateItem()` (fresh ids at every depth), `itemTitle()`.
- `FieldInput.vue`: renders `ItemList.vue` for `array` and `blocks`.
- `DocForm.vue`: a top-level array or blocks field gets its own card, like a group. `normalize()` recurses into items (`[]` by default, `id` and `blockType` kept). It imports `itemFields()` from core by relative path, like `condition.ts`, so `item-fields.ts` MUST have type imports only.
- `fields.ts`: `titleField()` skips `array` and `blocks`; `isEmpty()` treats `[]` as empty.

### Preview

- `views/Preview.vue`, `withMedia()`: recurses into items, so media ids in items reach the page as documents.

### Out of the first version

Placeholders from the default language inside items, block preview images, custom row labels.

## 5. Preview runtime

- `edit('pages', id, 'content.2.title')` works as is: the path is a string. The admin's `focusKey` opens row 2 and focuses the field.
- `preview/runtime/merge-draft.ts`: `merge()` becomes recursive. Lists of objects with `id` match items by `id`; objects merge per key; a value whose ids equal the page's keeps the page's populated value at any depth. This also fixes relations inside groups.

## 6. Examples and docs

- `examples/astro`: `pages` gets a `content` blocks field (`hero` with `title` and `image`, `text` with `body`), rendered by the catch-all with `edit()` bindings.
- `examples/standalone`: `posts` gets a `links` array (`label`, `url`).
- README: field table rows, a "Lists and blocks" section with schema, stored shape, populate/select and type narrowing.
- CLAUDE.md and module READMEs (`schema/`, `content/`, `db/`): the new helpers and rules.

## 7. Testing

- Unit: `itemFields`, `holdersAt`, `eachField` items, `fieldAt` with indices and blocks, `step`, `pick`, `badSelectPath`, `dataSchema`, `checkSchema`, `merge`, admin `items.ts`.
- Integration: new `src/tests/items.test.ts` (array and blocks): ids filled and kept; positional errors; `required`, `minRows`, `maxRows`; unknown block; defaults and field hooks inside items; populate and select through items; private fields stripped inside items; `set-null`, `restrict` and `cascade` from inside items, published and in a locale draft; a localized entry with an array; drafts and publish.
- Types: `inference.test.ts` cases for data, read, populate, select and narrowing.
- Manual: the Astro example's admin and preview.

## Out of scope

Filters on item fields, joins into items, `/` conditions into items, per-item localization, `blockName`, block preview images.
