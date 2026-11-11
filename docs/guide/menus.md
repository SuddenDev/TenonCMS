# Menus

A menu is a global with a list of links that nest. The `menu` preset gives you the fields, the admin shows them as a tree, and `menuItems()` turns a read into entries you can render.

## Set it up

```ts
import { defineCms } from "tenoncms";
import { menu } from "tenoncms/presets";

const mainMenu = menu({ depth: 2 });

defineCms({
  blocks: { ...mainMenu.blocks },
  globals: {
    mainMenu: {
      label: "Main menu",
      localized: true,
      nav: { display: "settings" },
      fields: { ...mainMenu.fields },
    },
  },
});
```

`menuPreset({ name: "mainMenu", depth: 2, localized: true })` in `defineCms({ presets })` does the same in one line. See [Presets in one line](./pages-and-seo.md#presets-in-one-line).

- `depth` is how many levels of children a menu has below the top. `0` (default) is a flat list, `1` allows one level, `-1` is unlimited. A heading counts as a level, so a flat menu has no headings.
- Reads are typed level by level, so `blockType` narrows at every depth. A depth above 9, or one that is not a literal, types the items loosely.
- The two blocks are:
  - `menuLink`: `link` (a [`link` field](./schema.md#links), required), `label` (text, optional) and `children` (links and headings).
  - `menuHeading`: `label` (text, required) and `children` (links).
- `fields.items` is a `blocks` field with `appearance: "tree"`. `blockType` stores `link` and `heading`.
- A link MAY hold links directly. A heading is never required.
- Only an unlimited menu (`depth: -1`) puts the blocks in `blocks`, as [shared blocks](./lists-and-blocks.md#nested-and-shared-blocks), because `menuLink` contains itself. A change to `menuLink` then applies at every depth. A finite menu nests the blocks inline and its `blocks` is empty, so `blocks: { ...mainMenu.blocks }` is harmless and `depth` can change later.
- Where the menu shows in the admin is up to `nav` on the global. Add more globals for more menus, like a footer menu. Menus that share blocks MUST come from one `menu()` call.

## Edit it

The admin shows the items as a tree:

- Drag rows to reorder and nest them. **Move to** in the row menu does the same with the keyboard.
- A click opens the item in a sheet next to the preview. Edits apply at once.
- The link input searches pages and other collections with a `permalink`. Typing a URL offers "Use https://…".
- Leave the label empty to use the target's title. The row shows that title in muted text.

See [Tree appearance](./lists-and-blocks.md#tree-appearance) for the details.

## Render it

```ts
import { menuItems } from "tenoncms";

const menu = await cms.getGlobal("mainMenu", { locale });
const items = menuItems(menu.items);
// [{ type: "link", label: "About", href: "/about", target: undefined, children: [...] }]
```

- `menuItems()` is in `tenoncms` and `tenoncms/client`. It makes no queries, so the read MUST be populated (the default).
- `type` is the item's `blockType`.
- `label` is the item's label, else the link's title, else `""`.
- `href` and `target` come from the item's link. A heading has `href: null`.
- An item whose link is broken (a deleted, unpublished or untranslated target) is left out, with its children.
- Other item fields, like an `icon` you add, pass through with their types.

An Astro component that calls itself for the children:

```astro
---
const { items } = Astro.props;
---
<ul>
  {items.map((item) => (
    <li>
      {item.href ? <a href={item.href} target={item.target}>{item.label}</a> : <span>{item.label}</span>}
      {item.children.length > 0 && <Astro.self items={item.children} />}
    </li>
  ))}
</ul>
```

`examples/astro` renders its main menu this way in `src/components/MenuList.astro`.

## Customize it

Add blocks of your own with `blocks`. Each one goes wherever a link goes: at the top, under links and under headings.

```ts
const mainMenu = menu({
  depth: -1,
  blocks: {
    button: {
      label: "Button",
      fields: {
        label: { type: "text", required: true },
        link: { type: "link", required: true },
        style: { type: "select", options: ["primary", "secondary"] },
      },
    },
  },
});
```

- `blockType` stores the key, `button`. In an unlimited menu the shared block is named after it, `menuButton`.
- The keys `link` and `heading` belong to the preset.
- `menuItems()` gives the item `type: "button"`, and `style` passes through. A block with a `link` field gets `href` and `target`; one without has `href: null`.

Everything else is plain objects, so you change it with spreads. More fields on links, or flat links:

```ts
const { menuLink } = mainMenu.blocks;
const { children, ...flatLink } = menuLink.fields;

defineCms({
  blocks: {
    ...mainMenu.blocks,
    menuLink: {
      ...menuLink,
      fields: { ...menuLink.fields, icon: { type: "select", options: ["home", "mail", "phone"] } },
    },
    // Flat links: menuLink: { ...menuLink, fields: flatLink },
  },
});
```

Without headings, remove `heading` from both lists of blocks:

```ts
const { menuLink } = mainMenu.blocks;
const { heading, ...itemBlocks } = mainMenu.fields.items.blocks;
const { heading: _, ...childBlocks } = menuLink.fields.children.blocks;

defineCms({
  blocks: {
    menuLink: {
      ...menuLink,
      fields: {
        ...menuLink.fields,
        children: { ...menuLink.fields.children, blocks: childBlocks },
      },
    },
  },
  globals: {
    mainMenu: { fields: { items: { ...mainMenu.fields.items, blocks: itemBlocks } } },
  },
});
```

## Languages

The preset does not set `localized`. The global does.

|                     | `localized: true`       | not localized           |
| ------------------- | ----------------------- | ----------------------- |
| Tree                | one, shared by default  | one, shared             |
| Internal link paths | per locale              | per locale              |
| Empty label         | target title per locale | target title per locale |
| Typed label         | per locale              | the same everywhere     |

- A locale without its own menu reads the default locale's with `fallback`. `copyGlobalLocale` copies a menu to a new locale.
- A target without a version in the read's locale resolves to the default locale's with `fallback`. Without it, the link is broken and `menuItems()` leaves it out.
- A localized menu keeps one tree in every locale by default, with labels per locale: an item added in one language shows in all of them. Keep it that way for most sites. `syncStructure: false` on the global, or **Separate per language** in its "…" menu, gives each locale its own tree (see [Localization](./localization.md#same-content-structure-in-all-languages)).
