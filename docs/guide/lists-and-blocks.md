# Lists and blocks

An `array` is a list of items that share one set of fields. A `blocks` field is a list where each item picks its fields by a block name.

```ts
links: {
  type: 'array',
  maxRows: 5,
  itemLabels: { singular: 'Link', plural: 'Links' },
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

`fields`, `blocks`, `minRows`, `maxRows` and `itemLabels` are in [Field options](./schema.md#field-options). `itemLabels.singular` names the add button ("Add Link") and an array row ("Link 2"). A block row shows its block label.

A row title is the item's first non-empty text value. `itemLabels.title` sets it with a template over the item's own fields, like `title: "{name} ({role})"`. Text and number values fill a placeholder. Without a result, the first text value is used.

Each block takes:

| Block option  | What it does                                                         |
| ------------- | -------------------------------------------------------------------- |
| `fields`      | The fields of an item of this block                                  |
| `label`       | Name in the block picker and the row header. Default: the block name |
| `description` | Help text in the block picker                                        |
| `icon`        | A Lucide icon name for the block picker, row header and outline      |
| `image`       | A picture for the block picker, in place of the icon. See below      |

`image` is a URL the site serves, usually an absolute path like `/blocks/hero.jpg` from the site's public folder. The picker shows it as is, cropped to 16:9.

## In the admin

- **Add** opens a picker with a card per block. It opens inside the document pane, so the visual preview stays visible.
- Drag a row by its handle to reorder it, or into or out of a nested list. A placeholder shows where it lands. A list takes only items of the same block (or array field), never inside the item itself, and not past `maxRows`.
- The row menu has **Move to** (the lists the item can go to, up or down the nesting) and **Collapse all** (every row of the field, at every depth).
- A row with nested lists has an **Outline** button. It shows the tree below the row, and its items move by drag and drop too.

## Tree appearance

`appearance: "tree"` shows the list as a compact tree instead of inline rows. [Menus](./menus.md) use it.

```ts
items: { type: "blocks", appearance: "tree", blocks: { link: "menuLink", heading: "menuHeading" } }
```

- Each item is a row with a drag handle, a chevron (only with children), the block icon, a title and a second line. The title is the first text value, else the title of the item's first `link` field, in muted text, else the item name (`Link 3`). The second line is the link's path or external host, with the collection, or else the block label.
- With one nested list, its items indent below the row. With two or more, each list shows its label.
- A click on a row opens the item in a sheet inside the document pane, so the preview stays visible. The sheet shows the trail (`Items › Products › Shoes`) and the item's fields, without the lists the tree shows. Edits apply at once, so autosave and live preview follow; **Done** closes it. Discard and version history undo changes.
- The row menu has **Add child**, **Duplicate**, **Move to** and **Delete**. With two or more nested lists, Add child asks which list.
- Drag and drop works as in the inline view. **Expand all** and **Collapse all** sit above the tree.
- **Add** appends an item and opens its sheet. With more than one block, the block picker opens first.
- A row with an error in it or below it shows a dot, and so does each row above it. A failed save opens the rows down to the first error.
- `edit()` on a field inside an item opens that item's sheet and focuses the field.

## Nested and shared blocks

A block can have its own `blocks` fields, so items nest. A `columns` block with a `left` and a `right` list works with plain objects. Reuse a block in several places by importing the same object.

Only a block that contains itself, like a `section` inside a `section`, needs a name: an object cannot point to itself while you define it. Put such blocks in `defineCms({ blocks })` and write the name where the block object would go:

```ts
defineCms({
  blocks: {
    text: { fields: { body: { type: "textarea" } } },
    section: {
      label: "Section",
      fields: {
        title: { type: "text" },
        children: { type: "blocks", blocks: ["section", "text"] },
      },
    },
  },
  collections: {
    pages: {
      fields: {
        content: { type: "blocks", blocks: { hero, section: "section", text: "text" } },
      },
    },
  },
});
```

- The key is what `blockType` stores, and the value names the shared block. They are usually the same, but `{ note: 'text' }` stores `note`.
- A list of names is short for keys that equal the names: `["section", "text"]` is `{ section: "section", text: "text" }`.
- A field MAY mix shared blocks and blocks defined in place, in the record form.
- A name that is not in `defineCms({ blocks })` is a type error in the `defineCms` call, which lists the names you can use. Inside a collection file, the editor cannot suggest names, because `defineCollection` does not know the shared blocks.
- Items nest to any depth. Validation, defaults, hooks, `private`, `populate` and `onDelete` work at every level, with positional paths like `content.0.children.2.body`.
- Result types follow the nesting, so `blockType` narrows at every level.
- `/schema` sends a shared block once, in `blocks`, and its name everywhere else.
- The admin asks the field `access` rules of a shared block once, without `collection` or `global`, to lock its inputs. The server still checks every read and write with the full arguments.

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

`edit("pages", page.id, "content.2.title")` binds a field of an item to an element for [live preview](./live-preview.md). The admin opens that row and focuses the field. In a tree, it opens the item's sheet.

## Limits

- Lists, and the fields inside them, are not filterable.
- No `join` inside items, no join `on` path into items, and no `unique` inside items.
- In a localized collection or global, a top-level list is one localized key: each locale has its own list, or all share it with `localized: false`. Fields inside items MUST NOT set `localized`.
- A custom field's server `load` inside a block item finds its field through the saved document, so it needs one.
- `defineCms` throws at startup for a join, `unique` or `localized` inside items, a join `on` into items, an empty `blocks` record, a block name that `defineCms({ blocks })` does not hold, a negative `minRows` or `maxRows`, and `minRows` above `maxRows`.
