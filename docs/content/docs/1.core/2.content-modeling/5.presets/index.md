---
title: Presets
description: Ready-made pages, menus and site strings, in one line or as parts of your own collections.
navigation:
  title: Overview
---

Most sites need the same few things: pages with nested URLs, a navigation menu and some translated button texts. Presets give you these as ready-made collections and globals from `tenoncms/presets`.

A preset is plain data. It returns the same field objects and hooks you would write yourself, so you can read what you get, and change or leave out any part of it.

You can use presets in two ways:

- **Whole presets** like `pagesPreset()` add a complete collection or global. You list them in `defineCms({ presets })`.
- **Parts** like `page()` and `seo()` return fields and hooks. You spread them into your own collection.

## Add a preset

List the presets in `defineCms()`:

```ts [tenon.config.ts]
import { defineCms } from "tenoncms";
import { menuPreset, pagesPreset, stringsPreset } from "tenoncms/presets";

export default defineCms({
  // ...
  presets: [
    pagesPreset({
      seo: true,
      blocks: {
        text: { label: "Text", fields: { body: { type: "richtext" } } },
      },
    }),
    menuPreset({ name: "mainMenu", depth: 2 }),
    stringsPreset({ readMore: "Read more" }),
  ],
});
```

This adds a `pages` collection, a `mainMenu` global and a `strings` global. Read them like your own entries:

```ts
const page = await cms.findOne("pages", { where: { path: "/about" } });
const menu = await cms.getGlobal("mainMenu");
const strings = await cms.getGlobal("strings");
```

## Presets

| Preset                                                           | Adds                                                              | Parts it uses     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------- |
| [`menuPreset()`](/docs/core/content-modeling/presets/menu)       | The global `menu` on the Settings page, with links that nest      | `menu()`          |
| [`pagesPreset()`](/docs/core/content-modeling/presets/pages)     | The collection `pages`: pages with a title, slug, parent and path | `page()`, `seo()` |
| [`stringsPreset()`](/docs/core/content-modeling/presets/strings) | The global `strings` on the Settings page, with one text per key  | `strings()`       |

[`settings()`](/docs/core/content-modeling/presets/settings) returns the `general` and `seo` globals that Tenon adds by default, so you can extend them.

## How presets merge

- Each preset takes a `name`. It sets the key of the collection or global, like `menuPreset({ name: "footerMenu" })`.
- Every other option of a collection or global passes through and wins over the preset's, like `label`, `localized` or `access`.
- `fields` adds fields after the preset's fields. A field with the key of a preset field replaces it.
- A name that your config, a plugin or another preset already uses stops the server at startup.
- The types work like your own entries. `cms.find("pages")` returns typed pages, and a typo in the name is a type error.

```ts
pagesPreset({
  label: "Site pages",
  localized: true,
  fields: {
    // Replaces the preset's `title`.
    title: { type: "text", required: true, maxLength: 80 },
    summary: { type: "textarea" },
  },
}),
```

## Build your own from parts

The whole presets are built from parts that you can use directly. Use them when you want your own collection or global with the preset's logic inside:

| Part                 | Returns                                                     | See                                                                                    |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `menu(options)`      | `fields` with the menu items, and the `blocks` they need    | [Menu](/docs/core/content-modeling/presets/menu#build-your-own)                        |
| `page(options)`      | `fields`, `hooks` and `permalink` of pages with nested URLs | [Pages](/docs/core/content-modeling/presets/pages#build-your-own)                      |
| `seo(templates)`     | `fields` with one `seo` group, and the admin's SEO editor   | [Pages](/docs/core/content-modeling/presets/pages#seo)                                 |
| `nestedPaths(names)` | The path hooks of `page()`, for other field names           | [Pages](/docs/core/content-modeling/presets/pages#nested-paths-with-other-field-names) |
| `settings()`         | The built-in `general` and `seo` globals                    | [Settings](/docs/core/content-modeling/presets/settings)                               |
| `strings(entries)`   | A complete localized global                                 | [Strings](/docs/core/content-modeling/presets/strings#build-your-own)                  |

Every part returns new plain objects on each call. Change them with spreads, or leave out what you do not need:

```ts [cms/collections/docs.ts]
import { defineCollection } from "tenoncms";
import { page, seo } from "tenoncms/presets";

const docs = page({ collection: "docs" });

// Leave the share image out of the SEO group.
const seoGroup = seo().fields.seo;
const { image, ...seoFields } = seoGroup.fields;

export const docsCollection = defineCollection({
  titleField: "title",
  permalink: docs.permalink,
  fields: {
    ...docs.fields,
    seo: { ...seoGroup, fields: { ...seoFields, keywords: { type: "text" } } },
  },
  hooks: docs.hooks,
});
```
