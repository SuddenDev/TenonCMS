# Lists and blocks

An `array` is a list of items that share one set of fields. A `blocks` field is a list where each item picks its fields by a block name.

```ts
links: {
  type: 'array',
  maxRows: 5,
  labels: { singular: 'Link', plural: 'Links' },
  fields: {
    label: { type: 'text', required: true },
    page: { type: 'relation', collection: 'pages' },
  },
},
content: {
  type: 'blocks',
  blocks: {
    hero: {
      label: 'Hero',
      description: 'Big title with an image',
      icon: 'image',
      fields: { title: { type: 'text', required: true }, image: { type: 'image' } },
    },
    text: { fields: { body: { type: 'textarea' } } },
  },
},
```

`fields`, `blocks`, `minRows`, `maxRows` and `labels` are in [Field options](./schema.md#field-options). `labels.singular` names the add button ("Add Link") and an array row ("Link 2"). A block row shows its block label.

Each block takes:

| Block option  | What it does                                                         |
| ------------- | -------------------------------------------------------------------- |
| `fields`      | The fields of an item of this block                                  |
| `label`       | Name in the block picker and the row header. Default: the block name |
| `description` | Help text in the block picker                                        |
| `icon`        | A Lucide icon name for the block picker and the row header           |

## How items are stored

Items live in the document JSON. Every item has a stable `id`. A block item also has its block name in `blockType`:

```json
"links":   [{ "id": "…", "label": "Docs", "page": "p1" }],
"content": [{ "id": "…", "blockType": "hero", "title": "Hi", "image": "m1" },
            { "id": "…", "blockType": "text", "body": "…" }]
```

- The server fills a missing `id` on every write, drafts included. The admin creates one for each new row, so ids stay the same across saves.
- An item field MUST NOT be named `id`. A block field MUST NOT be named `blockType`.
- `update` replaces a whole list, like a group. Items you send without an `id` get a new one.

## Validation

- `required` means at least one item. `required`, `minRows` and `maxRows` apply only when the field's condition matches, and not to draft saves.
- Error paths use the position: `content.2.title`, `links.0.page`. `Unknown block` (also in a draft), `Duplicate id`, `At least 2 items` and `At most 5 items` are field errors too.
- `default`, `validate`, field hooks and slugs work inside items. Hooks get the positional `path` and the item as `siblingData`.
- Inside an item, a condition key without `/` reads a field of the same item. Conditions outside the list cannot read into it.

## Reading

Reads treat a list like a group: `populate` and `select` go through it, and its key counts as no hop. Blocks are keyed by block name:

```ts
cms.find("pages", { populate: { links: { page: true } } });
cms.find("pages", { populate: { content: { hero: { image: true } } } });
cms.find("pages", {
  select: { links: { label: true }, content: { hero: { title: true }, text: true } },
});
// HTTP: ?populate=content.hero.image&select=links.label,content.hero.title
```

- The default `populate: true` resolves relations, images and files inside items. `true` on a list key resolves every relation in its items, one hop, in every block.
- One query per relation field per hop (per block, for blocks) covers the items of every document.
- Items always keep `id`, and block items keep `blockType`. A block that `select` does not name leaves `{ id, blockType }` for its items.
- Result types are a union of the blocks, so `if (block.blockType === 'hero')` narrows to the hero's fields. In written data an item's `id` is optional. In read results it is always there.
- `private` works inside items. A public read gets only `{ id, blockType }` for an item of a block that is no longer in the schema.
- `onDelete` rules apply inside items. `set-null` clears the value in every item that holds the id and keeps the items.

## On a site

`edit("pages", page.id, "content.2.title")` binds a field of an item to an element for [live preview](./live-preview.md). The admin opens that row and focuses the field.

## Limits

- Lists, and the fields inside them, are not filterable.
- No `join` inside items, no join `on` path into items, and no `unique` inside items.
- In a localized collection or global, a top-level list is one localized key: each locale has its own list, or all share it with `localized: false`. Fields inside items MUST NOT set `localized`.
- A custom field's server `load` inside a block item finds its field through the saved document, so it needs one.
- `defineCms` throws at startup for a join, `unique` or `localized` inside items, a join `on` into items, an empty `blocks` record, a negative `minRows` or `maxRows`, and `minRows` above `maxRows`.
