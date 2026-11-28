---
title: Fields
description: Pick a field type, set its options and check its values.
navigation:
  title: Overview
---

Each key in `fields` is one field. Its `type` says what it stores and which input the admin shows:

```ts [cms/collections/posts.ts]
export const posts = defineCollection({
  fields: {
    title: { type: "text", required: true },
    slug: { type: "slug", from: "title", unique: true },
    category: { type: "select", options: ["news", "guide"] },
    publishedAt: { type: "date" },
  },
});
```

## Field types

| Type                                                              | Stores                                       |
| ----------------------------------------------------------------- | -------------------------------------------- |
| [`array`](/docs/core/content-modeling/fields/array)               | A list of items with the same fields         |
| [`blocks`](/docs/core/content-modeling/fields/blocks)             | A list of page sections of different types   |
| [`boolean`](/docs/core/content-modeling/fields/boolean)           | `true` or `false`                            |
| [`date`, `datetime`](/docs/core/content-modeling/fields/date)     | A calendar day, or a moment in UTC           |
| [`file`](/docs/core/content-modeling/fields/file)                 | Any file from the media library              |
| [`group`](/docs/core/content-modeling/fields/group)               | Fields nested under one key                  |
| [`image`](/docs/core/content-modeling/fields/image)               | An image from the media library              |
| [`link`](/docs/core/content-modeling/fields/link)                 | A link to a document, a URL or a file        |
| [`number`](/docs/core/content-modeling/fields/number)             | A number                                     |
| [`relation`, `join`](/docs/core/content-modeling/fields/relation) | Ids of other documents, and the reverse side |
| [`richtext`](/docs/core/content-modeling/fields/rich-text)        | A structured document with formatting        |
| [`select`](/docs/core/content-modeling/fields/select)             | One or more of the listed `options`          |
| [`size`](/docs/core/content-modeling/fields/size)                 | A number with a CSS unit, `{ value, unit }`  |
| [`slug`](/docs/core/content-modeling/fields/slug)                 | A URL part, like `about-us`                  |
| [`text`, `textarea`](/docs/core/content-modeling/fields/text)     | A string                                     |
| [`custom:<name>`](/docs/core/customization/custom-fields)         | Any value, with your own input in the admin  |

## Common options

Every field type takes these options. The page of each type lists its own options.

:field-common-options{section="common" :collapsible="false"}

---

### Limits

- `default` applies only when a document is created, and only to fields that are missing.
- `required`, `default`, `hidden` and `private` do not apply to `join`, because a join stores nothing.

### Hide or protect a field

`hidden` and `readOnly` change only the admin (see [Admin options](#admin-options)). They are not access rules.

| Goal                                   | Use        |
| -------------------------------------- | ---------- |
| Keep a value out of the admin form     | `hidden`   |
| Show a value, but block edits in admin | `readOnly` |
| Keep a value out of public reads       | `private`  |
| Decide who can read or write a value   | `access`   |

## Admin options

These options change how the admin form shows a field. The stored document keeps its shape, and the API ignores them.

:field-common-options{section="admin" :collapsible="false"}

```ts
fields: {
  firstName: { type: "text", width: "1/2" },
  lastName: { type: "text", width: "1/2" },
  bio: { type: "textarea", separator: "About" },
  syncedAt: { type: "datetime", readOnly: true },
}
```

`tabs` and `fieldsets` are explained in [Collections and globals](/docs/core/content-modeling/collections-and-globals#options).

## Reading values in TypeScript

The field `type` sets the TypeScript type of a read. [Collections and globals](/docs/core/content-modeling/collections-and-globals#types) shows how reads are typed:

| Type                        | TypeScript type                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `text`, `textarea`, `slug`  | `string`                                                                                                                              |
| `date`, `datetime`          | `string`, as ISO text                                                                                                                 |
| `number`                    | `number`                                                                                                                              |
| `boolean`                   | `boolean`                                                                                                                             |
| `select`                    | The union of the `options`, or an array of it with `many`                                                                             |
| `relation`, `image`, `file` | An id `string`, or `string[]` with `many`                                                                                             |
| `size`                      | `{ value, unit }`, with the `units` as a union                                                                                        |
| `group`                     | An object of its fields                                                                                                               |
| `array`                     | A list of objects of its fields, each with an `id`                                                                                    |
| `blocks`                    | A list of objects, told apart by `blockType`                                                                                          |
| `richtext`, `link`          | The shapes of the [rich text](/docs/core/content-modeling/fields/rich-text) and [link](/docs/core/content-modeling/fields/link) pages |

```ts
const post = await cms.findOne("posts", { where: { slug } });
post?.title; // string, because the field is required
post?.category; // "news" | "guide" | null | undefined
```

- `required` removes `null` and `undefined` from the type. Without it, a field can also be `null` or missing.
- `populate` replaces ids with documents, and `select` drops fields. See [Reading](/docs/core/working-with-content/reading).

## Validation

Tenon checks every write on the server. The admin runs most checks too, so editors see errors before they save.

### Built-in checks

These options check a value without any code. An empty optional value skips them. Add `required` to demand a value.

::::field-group
:::field{name="required" type="boolean" :badges='[{"label":"all but join","color":"callout"}]'}
The value MUST be present. A list needs at least one item.
:::

:::field{name="minLength" type="number" :badges='[{"label":"text, textarea","color":"callout"}]'}
The fewest characters.
:::

:::field{name="maxLength" type="number" :badges='[{"label":"text, textarea","color":"callout"}]'}
The most characters.
:::

:::field{name="pattern" type="string" :badges='[{"label":"text, textarea","color":"callout"}]'}
A regular expression that the whole value MUST match. Write it as a string, so escape each backslash: `"\\d{5}"`.
:::

:::field{name="min" type="number" :badges='[{"label":"number, size","color":"callout"}]'}
The smallest value.
:::

:::field{name="max" type="number" :badges='[{"label":"number, size","color":"callout"}]'}
The largest value.
:::

:::field{name="step" type="number" :badges='[{"label":"number, size","color":"callout"}]'}
The value MUST be `min` (or `0`) plus a whole multiple of `step`, like the HTML `step` attribute.
:::

:::field{name="minRows" type="number" :badges='[{"label":"array, blocks","color":"callout"}]'}
The fewest items.
:::

:::field{name="maxRows" type="number" :badges='[{"label":"array, blocks","color":"callout"}]'}
The most items.
:::

:::field{name="unique" type="boolean" :badges='[{"label":"top-level simple fields","color":"callout"}]'}
No other document has the same value. Only the server checks it. See the rules below.
:::
::::

```ts
zip: { type: "text", pattern: "\\d{5}" },
rating: { type: "number", min: 1, max: 5 },
email: { type: "text", unique: true },
```

`unique` works on top-level `text`, `textarea`, `number`, `date`, `datetime`, `select`, `slug` and single `relation` fields of collections:

- It does not work in groups, lists or globals.
- The comparison is exact and case-sensitive.
- Empty values never collide.

### Your own checks

`validate` is a function that returns `true` or an error message:

```ts
end: {
  type: "date",
  validate: (value, { siblingData }) =>
    !value || value >= siblingData.start || "Ends before start",
},
```

The function gets the `value` and an object with these keys:

| Key           | Holds                                                            |
| ------------- | ---------------------------------------------------------------- |
| `siblingData` | The values next to this field: same document, group or list item |
| `data`        | The whole document                                               |
| `originalDoc` | The stored document. Empty on create                             |
| `operation`   | The write: `create`, `update` or `setGlobal`                     |
| `cms`         | The local API. Use it for lookups                                |
| `user`        | The signed-in user                                               |

The function can be `async`. It runs on the server only.

### Standard Schema

`validate` also takes a [Standard Schema](https://standardschema.dev). Zod, Valibot and ArkType schemas all work, so you can reuse a schema you already have:

```ts
import { z } from "zod";

email: { type: "text", validate: z.email("Not an email") },
website: { type: "text", validate: z.url() },
```

- The first issue of the schema is the error message.
- An empty value (`null`, missing or `""`) skips the schema, like the built-in checks. Add `required` to demand a value.
- The schema only checks. The stored value stays what the editor typed, even when the schema transforms it.
- It runs on the server only.

### Where checks run

| Rule                                    | In the admin | On the server |
| --------------------------------------- | ------------ | ------------- |
| `required` and the built-in checks      | Yes          | Yes           |
| `condition` and a plain `default`       | Yes          | Yes           |
| `validate`, a function `default`, hooks | No           | Yes           |
| `unique`                                | No           | Yes           |

Errors of the server show at the field in the admin. Over HTTP, all errors of one write come back in one `400` response.

## Conditions

`condition` shows a field only when other values match. This example shows a field for each kind of media:

```ts
fields: {
  mediaType: { type: "select", options: ["image", "video", "youtube"] },
  image: { type: "image", condition: { mediaType: "image" } },
  url: { type: "text", required: true, condition: { mediaType: "youtube" } },
  caption: { type: "text", condition: { mediaType: { ne: "youtube" } } },
}
```

Here the editor picks `youtube`. The admin shows `url` and hides `image` and `caption`. The `required` check of `url` applies only now.

### Match rules

- A plain value means "equals". The operators are `eq`, `ne`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte` and `exists`.
- Several keys MUST all match.
- `$some` matches when one condition in a list matches. `$every` matches when all do.
- A key names a field next to this one: in the same document, group or list item.
- Start a key with `/` to name a field from the document root, like `"/settings.mode"`.

```ts
fields: {
  mediaType: { type: "select", options: ["image", "video", "youtube"] },
  forSale: { type: "boolean" },
  price: { type: "number", condition: { forSale: true } },
  note: { type: "text", condition: { price: { gt: 0 } } },
  // One of several values.
  player: {
    type: "text",
    condition: { $some: [{ mediaType: "video" }, { mediaType: "youtube" }] },
  },
  // A field in a group or list item reads a field of the document root.
  badge: { type: "text", condition: { "/forSale": true } },
}
```

### What a false condition does

- The admin hides the field and saves it as `null`.
- The server skips `required` and the other checks for it.
- Reads ignore conditions and return what is stored.

`condition` is JSON, because the admin evaluates it in the browser. For logic that needs code, use `validate` or a [hook](/docs/core/working-with-content/hooks).
