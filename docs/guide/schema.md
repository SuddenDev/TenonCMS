# Schema and fields

You describe your content in TypeScript. Each collection is a list of fields. Types flow from here into your pages.

## Define a collection

```ts
// collections/posts.ts
import { defineCollection } from "tenoncms";

export const posts = defineCollection({
  label: "Posts",
  titleField: "title",
  fields: {
    title: { type: "text", required: true },
    slug: { type: "slug", from: "title", unique: true },
    author: { type: "relation", collection: "authors" },
    publishedAt: { type: "date" },
    category: { type: "select", options: ["news", "guide"] },
    featured: { type: "boolean" },
    body: { type: "textarea" },
  },
});
```

```ts
// collections/authors.ts
export const authors = defineCollection({
  titleField: "name",
  fields: {
    name: { type: "text", required: true },
    posts: { type: "join", collection: "posts", on: "author" },
  },
});
```

The instance lives in `tenon.config.ts` at the project root:

```ts
import { defineCms } from "tenoncms";
import { libsql } from "tenoncms/libsql";
import { authors } from "./collections/authors";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts, authors },
  database: libsql("file:/absolute/path/cms.db"), // or libsql://… (Turso) with { url, authToken }
  secret: process.env.CMS_SECRET!, // at least 32 characters
});
```

`defineCms()` checks `secret`, `database` and `media.storage` when the config loads. A missing or short secret, a database without its URL or a storage without its bucket or keys throws one error that lists every problem, so the server stops at startup. A build that loads the config, for example to prerender pages, needs these values too. A custom storage adapter MAY report its own missing options in `problems`.

Each database has its own entry and driver, so you install only the one you use:

| Database                         | `database`                                       | Install                |
| -------------------------------- | ------------------------------------------------ | ---------------------- |
| SQLite file, `:memory:` or Turso | `libsql(url)` from `tenoncms/libsql`             | `@libsql/client`       |
| SQLite file or `:memory:`        | `sqlite(path)` from `tenoncms/sqlite`            | nothing (Node 22.16+)  |
| Postgres                         | `postgres(url)` from `tenoncms/postgres`         | `pg`                   |
| PGlite                           | `pglite(new PGlite(dir))` from `tenoncms/pglite` | `@electric-sql/pglite` |
| Cloudflare Durable Object        | `durableObject()` from `tenoncms/cloudflare`     | nothing                |

`libsql()` and `postgres()` take a URL or their driver's options. For Postgres, install `pg` and use `database: postgres(process.env.DATABASE_URL!)` from `tenoncms/postgres`. It also takes the options of a `pg` pool. For PGlite, Postgres in WebAssembly for local dev and tests, install `@electric-sql/pglite` and use `database: pglite(new PGlite("./.data/cms"))` from `tenoncms/pglite`. `sqlite()` uses Node's built-in `node:sqlite`, so it needs no package. On an older Node, use `libsql()`. The CMS creates its tables in the connection's current schema.

`database` also takes `{ dialect }`, a Kysely dialect you build: SQLite, or Postgres with Kysely's `PostgresAdapter`. Its transactions MUST stay open across `await`. On Cloudflare, use `database: durableObject()` from `tenoncms/cloudflare` and export `tenonObject(cms)` from the Worker entry: the CMS then runs inside a Durable Object, and code outside it reads and writes through `createClient()` over the object's `fetch`.

`defineGlobal()` works the same for globals: one document per name, such as site settings. Auth options are in [Auth, users and access](./auth-and-access.md).

## Field types

| Type               | Stores                                       | More                                      |
| ------------------ | -------------------------------------------- | ----------------------------------------- |
| `text`, `textarea` | A string                                     |                                           |
| `number`           | A number                                     |                                           |
| `size`             | A number with a CSS unit, `{ value, unit }`  | [Sizes](#sizes)                           |
| `boolean`          | `true` or `false`                            |                                           |
| `date`             | A calendar date, `2026-10-17`                | [Dates](#dates)                           |
| `datetime`         | A UTC timestamp, `2026-10-17T12:00:00.000Z`  | [Dates](#dates)                           |
| `select`           | One or more of the listed `options`          |                                           |
| `slug`             | A URL part, `about-us`                       | [Slugs](#slugs)                           |
| `group`            | Fields nested under one key                  | [Groups](#groups)                         |
| `array`, `blocks`  | Lists of items                               | [Lists and blocks](./lists-and-blocks.md) |
| `relation`, `join` | Ids of other documents, and the reverse side | [Relations](./relations.md)               |
| `image`, `file`    | Media ids                                    | [Media](./media.md)                       |
| `richtext`         | A Tiptap document                            | [Rich text](./richtext.md)                |
| `link`             | A link to a document or a URL                | [Links](#links)                           |
| `custom:<name>`    | Your own input in the admin                  | [Customize the admin](./admin.md)         |

## Field options

| Option                              | Types                                                                                           | What it does                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `label`, `description`              | all                                                                                             | Label and help text in the admin                                                                 |
| `placeholder`                       | `text`, `textarea`, `number`, `size`, `date`, `datetime`                                        | Shown in the empty input                                                                         |
| `required`                          | all but `join`                                                                                  | The value MUST be present                                                                        |
| `default`                           | all but `join`                                                                                  | Value on `create` when the field is `undefined`                                                  |
| `minLength`, `maxLength`, `pattern` | `text`, `textarea`                                                                              | Length, and a regular expression for the whole value                                             |
| `prefix`, `suffix`                  | `text`                                                                                          | Fixed text before and after the input, like `https://`                                           |
| `rows`                              | `textarea`                                                                                      | Height of the empty input in lines (default `8`)                                                 |
| `min`, `max`, `step`                | `number`, `size`                                                                                | Number range and step                                                                            |
| `units`                             | `size`                                                                                          | The CSS units to pick from; the first is preselected                                             |
| `fields`                            | `group`, `array`                                                                                | The fields of the group, or of each item                                                         |
| `blocks`                            | `blocks`                                                                                        | The item types, keyed by block name, or shared names                                             |
| `minRows`, `maxRows`                | `array`, `blocks`                                                                               | Fewest and most items                                                                            |
| `itemLabels`                        | `array`, `blocks`                                                                               | `{ singular, plural, title }` item labels in the admin                                           |
| `appearance`                        | `array`, `blocks`                                                                               | `"tree"`: edit the items as a tree in the admin                                                  |
| `appearance`                        | `group`                                                                                         | `"plain"`: show the fields without box and heading                                               |
| `appearance`                        | `number`                                                                                        | `"plain"` (no buttons), `"stepper"` (− and +), `"slider"` (needs `min`, `max`); default chevrons |
| `validate`                          | all but `join`                                                                                  | Your own check, on the server                                                                    |
| `condition`                         | all                                                                                             | The field applies only when this matches                                                         |
| `unique`                            | top-level `text`, `textarea`, `number`, `date`, `datetime`, `select`, `slug`, single `relation` | No two documents MAY have the same value                                                         |
| `private`                           | all                                                                                             | Keep the value out of public HTTP reads                                                          |
| `readOnly`                          | all but `join`                                                                                  | The admin shows the input disabled                                                               |
| `hidden`                            | all                                                                                             | The admin does not show the input                                                                |
| `separator`                         | all                                                                                             | A line above the field; a text adds a heading below it                                           |
| `hooks`                             | all but `join`                                                                                  | See [Hooks](./hooks.md)                                                                          |

The admin receives the schema as JSON. Browser field descriptions can use [typed `.client.ts` imports](admin.md#reactive-field-descriptions), which the build replaces with references. Other function behavior follows these rules:

- `required`, `condition`, the built-in checks and a plain `default` work in the admin and on the server.
- `validate`, a function `default` and hooks run on the server only. Their messages reach the admin as field errors.
- Empty optional values skip the built-in checks.

## Defaults

`default` is a value or a function. It applies on `create` only, to fields that are `undefined` (not `null`), before `beforeValidate` hooks. A group's children get their defaults only when the group is sent.

```ts
status: { type: 'select', options: ['draft', 'live'], default: 'draft' },
author: { type: 'relation', collection: 'authors', default: ({ user }) => user?.id },
```

## Validation

Built-in checks are `required`, `minLength`, `maxLength`, `pattern`, `min`, `max`, `minRows` and `maxRows`.

- `pattern` is a string, not a `RegExp`. It MUST match the whole value (`^…$` is implied) and compiles with the `v` flag, like the HTML `pattern` attribute. A `<textarea>` has no `pattern` attribute, so there only the server checks it.

`validate` returns `true` or an error message. It runs after the type checks and before `beforeChange` hooks. It does not run on the second validation after them, or on `onDelete` updates. All messages of one write come back in a single 400.

```ts
end: { type: 'date', validate: (value, { siblingData }) => !value || value >= siblingData.start || 'Ends before start' },
```

It receives `data`, `siblingData`, `originalDoc`, `operation`, `path`, `cms` and `user`, like field hooks.

## Conditions

`condition` shows a field only when other values match:

```ts
url: { type: 'text', required: true, condition: { mediaType: 'youtube' } },
price: { type: 'number', condition: { forSale: true } },
note: { type: 'text', condition: { price: { gt: 0 } } },
embed: { type: 'text', condition: { $some: [{ mediaType: 'video' }, { mediaType: 'youtube' }] } },
color: { type: 'text', condition: { '/settings.mode': 'advanced' } },
```

- A plain value means `eq`. Operators: `eq`, `ne`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`, `exists`. Several keys MUST all match. `$every` and `$some` take lists of conditions and nest.
- A key without `/` names a sibling: a top-level field, a field of the same group, or a field of the same list item. A leading `/` starts at the document root. Dots walk into groups, never into items.
- The admin hides fields whose condition is false and saves them as `null`. Values survive toggling until you save.
- The server skips `required`, the built-in checks and `validate` for such fields, but still checks the type. It never changes or clears values. Reads ignore conditions.
- `defineCms` throws for a condition on an unknown field, and for a path that crosses an `array` or `blocks` field.

## Unique values

`unique` rejects a value that another document of the collection already has, with `Already used` on the field (400).

- It runs after `beforeChange` hooks, so values set by hooks count.
- `null` and missing values never collide. Comparison is exact and case-sensitive.
- `defineCms` throws for `unique` in a group, in a global, inside list items, or on other types.
- Each write scans the collection once per unique field. Indexes can come later without API changes.

## Private and read-only fields

`private` keeps a value out of public reads. It is an [access rule](./auth-and-access.md#access-control) with `read` set to "signed in". The server `cms`, hooks and the admin (HTTP with a session) read and write it. HTTP without a session neither sends it nor filters by it.

- A filter on a private field without a session returns 400.
- The rule also applies to populated and joined documents, by the rules of their own collection. On a group it covers the whole group.
- Client types make `private` fields optional.

`hidden` only changes the admin: the input is not shown, but the value loads, saves and validates as usual. Use it for a value that a hook or code owns.

`readOnly` only changes the admin: the input is disabled, and on a group every input inside. The local API, HTTP and hooks can still write the value. A hook that owns the value MUST overwrite it, like the page preset's `path` hook.

## Slugs

A `slug` is a URL part such as `about-us`.

```ts
slug: { type: 'slug', from: 'title', unique: true }
```

- A value MUST match `[a-z0-9]+(-[a-z0-9]+)*`. Server and admin both check it. Like other fields, it is optional unless `required: true`.
- `from` names a sibling field. The server fills an empty slug from it on every write, before `beforeValidate`. On a new document the admin fills it while you type, until you edit the slug yourself. A saved slug never changes on its own, so URLs stay stable. Pasted text is slugified, like `Über uns!` to `uber-uns`.
- `parent` names a sibling `relation`. The admin then shows the parent's path before the input, like `/about/` [team]. The prefix is a button: it opens a searchable list of the related collection and writes the choice to the relation field. The list leaves out the page itself and its descendants, and the prefix is disabled when the relation is `readOnly`. `path` names the parent's field to show (default `'path'`). Hide the relation with `hidden: true` if the slug is its only editor. See [Pages and SEO](./pages-and-seo.md).
- `unique: true` fits flat collections such as blog posts. Page trees use the `uniquePath` hook instead, because the same slug may repeat under different parents.

## Dates

A `date` stores a calendar date. A `datetime` stores a UTC ISO timestamp. The admin shows both in the interface language and edits date-times in the browser's time zone, with a time input that includes seconds.

## Sizes

A `size` stores a number with one of its `units`. `min`, `max` and `step` check the number. The unit type comes from the list:

```ts
gap: { type: 'size', units: ['px', 'rem'], min: 0 },
```

```vue
<section :style="{ gap: page.gap && `${page.gap.value}${page.gap.unit}` }" />
```

A `size` is not filterable and cannot be `unique`.

## Groups

A `group` nests fields under one key and renders as one section in the admin:

```ts
seo: {
  type: 'group',
  label: 'SEO',
  fields: {
    title: { type: 'text' },
    description: { type: 'textarea' },
    noindex: { type: 'boolean' },
  },
}
```

- An optional group can be missing or `null`, so read it as `doc.seo?.title`.
- Inner `required` fields apply only when the group is present.
- The admin saves an optional group that holds only empty values as `null`.
- Filters (`where`, query strings) accept top-level fields only, not groups or their inner fields.
- `editor: "seo"` shows the admin's SEO editor around the fields of [`seo()`](./pages-and-seo.md#the-seo-editor). It is set by `seo()`.

## Links

A `link` field points to a document of a collection with a `permalink`, to a URL or to a media file. Menus use it, see [Menus](./menus.md).

```ts
cta: { type: "link" }
cta: { type: "link", required: true }
download: { type: "link", allowed: ["file"] }
```

`allowed` limits what it MAY point to: `"internal"` (a document with a `permalink`), `"external"` (a typed URL) and `"file"` (a media file). The default is all three; without media, the admin offers no files.

It stores one of these, with an optional `target` (`_self`, `_blank`, `_parent`, `_top`) and an optional `suffix`:

```ts
{ reference: { collection: "pages", id: "p1" }, target: "_blank" }
{ reference: { collection: "pages", id: "p1" }, suffix: "?ref=nav#team" }
{ reference: { collection: "media", id: "m1" } }
{ href: "https://example.com" }
```

- A `suffix` is a query and anchor that a read appends to `href`, for a reference and for a URL. It starts with `?` or `#` and has no whitespace. A `#` suffix replaces the fragment of the URL, a `?` suffix replaces its query and fragment.

- An `href` follows the rich text rules: HTTP(S), `mailto:`, `tel:`, relative paths and fragments. Executable schemes are rejected.
- A bad shape, a bad `href`, a kind that `allowed` leaves out or a collection without a `permalink` is a field error at its path, like `items.0.children.2.link`, also in drafts.
- Publishing checks that the target exists. Drafts keep the loose checks.
- It works at every depth in groups and lists. It is not filterable and cannot be `unique`.

A populated read adds the target's `permalink` (or the file's URL) as `href`, in the read's locale and perspective, with the locale prefix of `routing`, and its title as `title`. This also holds in a collection or global that is not localized. Preview URLs are never used.

```ts
{ reference: { collection: "pages", id: "p1" }, href: "/de/about", title: "Über uns" }
```

- A target that is not available (deleted, unpublished in a public read, denied, or missing in the locale with `fallback: false`) reads as `href: null` and `broken: true`. It is never an error.
- `populate: false` returns the stored value. A write ignores `href`, `title` and `broken` next to a `reference`, so a read value can be saved back.
- Deleting a linked document throws `LinkedContentError` (409, `LINKED_CONTENT`), like [rich text](./richtext.md#deleting-linked-content). `{ allowBrokenLinks: true }` deletes it and marks `reference.deleted: true` in every value that pointed to it.

In the admin, one input searches titles across collections with a `permalink` and takes a typed URL ("Use https://…"). "File…" in the list and the clip button in the input open the media library. A second input sets the `suffix`, and a switch opens the link in a new tab.
