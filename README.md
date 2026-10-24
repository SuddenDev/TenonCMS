# integral-cms

A CMS that lives **inside** your Vite-based app. One repo, one deployment, one database file.

> Status: proof of concept. Works with Astro, Nuxt and TanStack Start on Node. Not published to npm yet.

## Why

Headless CMSs are framework-agnostic because they talk REST or GraphQL. The price: a second service with its own deployment, Docker setup and a Postgres or MySQL server.

integral-cms takes the other route, like Pruvious (Nuxt) and Payload 3 (Next.js), but for any framework built on Vite:

- **Part of your app.** The admin UI and API are routes in your app. No second service.
- **Schema in code.** Collections and globals are TypeScript. Types flow into your pages.
- **Local API.** Server code calls `cms.find('posts')` directly. No HTTP round trip.
- **SQLite first.** A file on disk, or Turso via libsql. Cloudflare D1 is planned.
- **Your bundle, your admin.** The admin is a Vue app that your Vite bundles. Add field inputs or styles from one file, or leave it out and go headless.
- **Web standards.** The core is a [Hono](https://hono.dev) app: `Request` in, `Response` out. Framework adapters are a few lines.

## Quickstart

Requires Node 22.14+ and pnpm.

```sh
pnpm install

cp examples/astro/.env.example examples/astro/.env   # set CMS_SECRET (32+ chars)
pnpm dev:astro                                        # http://localhost:4321/admin

cp examples/nuxt/.env.example examples/nuxt/.env     # set NUXT_CMS_SECRET (32+ chars)
pnpm dev:nuxt                                         # http://localhost:3000/admin

cp examples/tanstack-start/.env.example examples/tanstack-start/.env   # set CMS_SECRET (32+ chars)
pnpm dev:tanstack                                     # http://localhost:3100/admin

cp examples/standalone/.env.example examples/standalone/.env   # set CMS_SECRET (32+ chars)
pnpm dev:standalone                                   # http://localhost:3200/admin
```

Generate a secret with `openssl rand -hex 32`.

On first visit, choose "Create the admin account". Only the first user can sign up.

## Usage

### 1. Define the schema and create the instance

`integral.config.ts` in the project root exports the instance. Collections can live in their own files.

```ts
// collections/posts.ts
import { defineCollection } from "integral-cms";

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

```ts
// integral.config.ts
import { admin, twoFactor } from "better-auth/plugins";
import { defineCms } from "integral-cms";
import { authors } from "./collections/authors";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts, authors },
  database: { url: "file:/absolute/path/cms.db" }, // or libsql://…, plus authToken
  secret: process.env.CMS_SECRET!, // at least 32 characters
  // Optional, see Auth below.
  auth: {
    plugins: [admin(), twoFactor()],
    databaseHooks: { user: { create: { after: sendWelcome } } },
    session: { expiresIn: 60 * 60 * 24 * 30 },
  },
});
```

Field types: `text`, `textarea`, `number`, `boolean`, `date`, `datetime`, `select`, `slug`, `group`, `array`, `blocks` (see [Lists and blocks](#lists-and-blocks)), `relation`, `join` (see [Relations](#relations)). `defineGlobal()` does the same for globals.

A `date` stores a calendar date (`2026-10-17`). A `datetime` stores a UTC ISO timestamp (`2026-10-17T12:00:00.000Z`). The admin shows both in the interface language and edits date-time values in the browser’s local timezone. Date-time pickers include a time input with seconds.

A `slug` is a URL part such as `about-us`:

```ts
slug: { type: 'slug', from: 'title', unique: true }
```

- A value MUST match `[a-z0-9]+(-[a-z0-9]+)*`. The server and the admin check it. Like other fields, it is optional unless `required: true`.
- `from` names a sibling field. The server fills an empty slug from it on every write, before `beforeValidate`. On a new document, the admin fills the slug from it while you type, until you edit the slug. A saved slug never changes on its own, so URLs stay stable.
- `parent` names a sibling `relation`. The admin then shows the parent's path before the input, e.g. `/about/` [team]. `path` names the parent's field to show (default `'path'`). See [Pages and SEO](#pages-and-seo).
- `unique: true` fits flat collections such as blog posts. Page trees use the `uniquePath` hook instead, because the same slug may repeat under different parents.

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
- The admin saves an optional group with only empty values as `null`.
- Filters (`where`, query strings) accept top-level fields only, not groups or their inner fields.

#### Field options

| Option                              | Types                                                                                           | What it does                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `label`                             | all                                                                                             | Label in the admin                                          |
| `description`                       | all                                                                                             | Help text below the field in the admin                      |
| `placeholder`                       | `text`, `textarea`, `number`, `date`, `datetime`                                                | Shown in the empty input                                    |
| `required`                          | all but `join`                                                                                  | The value MUST be present                                   |
| `default`                           | all but `join`                                                                                  | Value on `create` when the field is `undefined`             |
| `minLength`, `maxLength`, `pattern` | `text`, `textarea`                                                                              | String length, and a regular expression for the whole value |
| `min`, `max`                        | `number`                                                                                        | Number range                                                |
| `fields`                            | `group`, `array`                                                                                | The fields of the group, or of each item                    |
| `blocks`                            | `blocks`                                                                                        | The item types, keyed by block name                         |
| `minRows`, `maxRows`                | `array`, `blocks`                                                                               | Fewest and most items                                       |
| `labels`                            | `array`, `blocks`                                                                               | `{ singular, plural }`, item labels in the admin            |
| `validate`                          | all but `join`                                                                                  | Your check, on the server                                   |
| `condition`                         | all                                                                                             | The field applies only when this matches                    |
| `unique`                            | top-level `text`, `textarea`, `number`, `date`, `datetime`, `select`, `slug`, single `relation` | No two documents MAY have the same value                    |
| `private`                           | all                                                                                             | Keep values out of public HTTP reads                        |
| `readOnly`                          | all but `join`                                                                                  | The admin shows the input disabled                          |
| `hooks`                             | all but `join`                                                                                  | See [Hooks](#hooks)                                         |

The admin gets the schema as JSON, so functions never reach the browser:

- `required`, `condition`, the built-in checks and a plain `default` work in the admin and on the server.
- `validate`, a function `default` and hooks run on the server only. Their messages reach the admin as field errors.
- `pattern` is a string, not a `RegExp`. It MUST match the whole value (`^…$` is implied) and compiles with the `v` flag, like the HTML `pattern` attribute. `<textarea>` has no `pattern` attribute, so there only the server checks it.
- Empty optional values skip the built-in checks.

`default` is a value or a function. It applies on `create` only, to fields that are `undefined` (not `null`), before `beforeValidate` hooks. Children of a group get their defaults only when the group is sent.

```ts
status: { type: 'select', options: ['draft', 'live'], default: 'draft' },
author: { type: 'relation', collection: 'authors', default: ({ user }) => user?.id },
```

`validate` returns `true` or an error message. It runs after the type checks and before `beforeChange` hooks, not on the second validation after them, and not on `onDelete` updates. All messages of a write come back in one 400.

```ts
end: { type: 'date', validate: (value, { siblingData }) => !value || value >= siblingData.start || 'Ends before start' },
```

It gets `data`, `siblingData`, `originalDoc`, `operation`, `path`, `cms` and `user`, like field hooks.

`condition` shows a field only when other values match:

```ts
url: { type: 'text', required: true, condition: { mediaType: 'youtube' } },
price: { type: 'number', condition: { forSale: true } },
note: { type: 'text', condition: { price: { gt: 0 } } },
embed: { type: 'text', condition: { $some: [{ mediaType: 'video' }, { mediaType: 'youtube' }] } },
color: { type: 'text', condition: { '/settings.mode': 'advanced' } },
```

- A plain value means `eq`. Operators: `eq`, `ne`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`, `exists`. Several keys MUST all match. `$every` and `$some` take lists of conditions and nest.
- A key without `/` is a sibling field: a field of the document at the top level, a field of the same group inside a group, a field of the same item inside an array or block item. A leading `/` starts at the document root; dots walk into groups, never into items.
- The admin hides fields whose condition is false and saves them as `null`. Values survive toggling until you save.
- The server skips `required`, the built-in checks and `validate` for them, but still checks the type. It never changes or clears values. Reads ignore conditions.
- `defineCms` throws for a condition on an unknown field, and for one whose path crosses an `array` or `blocks` field.

`unique` rejects a value that another document of the collection has, with `Already used` on the field (400). It runs after `beforeChange` hooks, so values set by hooks count. `null` and missing values never collide; comparison is exact and case-sensitive. `defineCms` throws for `unique` in a group, in a global or on other types. Each write scans the collection once per unique field; indexes can come later without API changes.

`private` keeps a value out of public reads. The local API, hooks and the admin (HTTP with a session) read and write it; HTTP without a session neither sends it nor filters by it.

- A filter on a private field without a session returns 400, like an unknown field.
- The rule also applies to populated and joined documents, by the rules of their own collection. On a group, it covers the whole group.
- Client types make `private` fields optional.

`readOnly` only changes the admin: the input is disabled, and on a group every input inside. The local API, HTTP and hooks can still write the value. A hook that owns the value MUST overwrite it, like the page preset's `path` hook.

### 2. Read content

```ts
await cms.find("posts"); // all, newest first
await cms.find("posts", { where: { category: "news" } }); // equality filters
await cms.find("posts", { limit: 5 }); // the 5 newest
await cms.findOne("posts", { where: { slug: "hello" } });
await cms.findById("posts", id);
await cms.getGlobal("general"); // a default settings global, see Settings
```

Everything is typed from the schema. Unknown collections or fields are type errors.

Reads are also available over HTTP without a session, because the site renders that content anyway.
Query params are equality filters, and `limit` caps the result: `GET /api/cms/collections/posts?slug=hello&limit=1`, `GET /api/cms/globals/general`. `?category=null` matches an empty or missing field, like `null` in `where`; an empty value (`?category=`) adds no filter.
`populate` and `depth` control [relations](#relations), `select` the fields that come back. Because of that, fields named `limit`, `populate`, `depth` or `select` cannot be filtered over HTTP.
Writes and the schema endpoint need an admin session.

Reads return whole documents unless `select` lists the fields you need. `populate` decides which relations are resolved; `select` decides what comes back:

```ts
const page = await cms.findOne("pages", {
  where: { path: "/about/team/person" },
  populate: { parent: { parent: true } },
  select: {
    title: true,
    path: true,
    parent: { title: true, path: true, parent: { title: true, path: true } },
  },
});
// { id, title, path, parent: { id, title, path, parent: { id, title, path } } }
```

| In `select`                  | Result                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| a field `: true`             | the field's value                                                                             |
| a group `: true`             | the whole group                                                                               |
| a group `: { … }`            | only the listed children, by these same rules                                                 |
| a relation or join `: true`  | the value as `populate` leaves it: an id, ids, a document or documents                        |
| a relation or join `: { … }` | the resolved document, or each item of a `many` relation or join, with only the listed fields |
| a field not listed           | left out                                                                                      |

- `find`, `findOne`, `findById` and `getGlobal` accept it, in the local API, the client and `useIntegral()`. Writes do not.
- `id` always comes back, at every level with documents. `createdAt` and `updatedAt` only when listed. `select: {}` returns only `id`.
- A join still comes back only when `populate` names it. `private` fields stay hidden without a session; selecting one is not an error.
- Hooks see full documents: `select` runs after `afterRead` and before `afterOperation`. The database still loads whole rows; `select` limits what leaves the read.
- Result types contain only the selected fields. An unknown key, an object on a plain field and an object on a relation that `populate` does not resolve are type errors, and 400 over HTTP (`Invalid select: parent.nope`).

Over HTTP, `?select=` is a comma-separated list of dot paths: `?populate=parent&select=title,path,parent.title,parent.path`. A path that ends at a group, relation or join means `true`; `seo` and `seo.title` together mean `seo: { title: true }` (the longer path wins). The client builds these paths from the object. An empty object inside ends a path, so `select: { parent: {} }` is `{ id }` in the local API but the whole `parent` over HTTP, as with `populate`.

`update` and `setGlobal` change only the top-level fields they get; the others keep their stored values. `null` clears a field. A group you send replaces the stored group. This holds for the local API, HTTP `PUT` and the client:

```ts
await cms.update("posts", id, { views: 5 }); // title, body and the rest stay
```

In the browser (admin pages, islands, client components), `integral-cms/client` gives the same methods over HTTP, typed from your schema:

```ts
import { createClient } from "integral-cms/client";

const client = createClient();
await client.find("posts", { where: { featured: true } });
await client.findOne("pages", {
  where: { path },
  populate: { parent: true },
  select: { title: true, parent: { title: true } },
});
await client.update("posts", id, post); // needs a session, so it works in admin pages
await client.getSession(); // the signed-in admin, or null
await client.request("/redirects/lookup", { query: { path } }); // any route under /api/cms, e.g. a plugin's
```

To type your own browser code, `Collections<C>` and `Globals<C>` give the schema as HTTP sends it, with `private` fields optional:

```ts
import type { Collections } from "integral-cms/client";
import type cms from "../integral.config";

type PostFields = Collections<typeof cms>["posts"]["fields"];
```

The Astro and Nuxt adapters register your `cms` type, so `createClient()` needs no type argument. Without an adapter, add this to `tsconfig.json`:

```jsonc
"compilerOptions": {
  "types": ["integral-cms/register"],
  "paths": { "#integral/config": ["./integral.config.ts"] }
}
```

`createClient<typeof otherCms>()` overrides the registered type.

### Relations

Documents reference other documents. A `relation` stores ids, a `join` reads the other side:

```ts
author: { type: 'relation', collection: 'authors' }                    // m-1
tags: { type: 'relation', collection: 'tags', many: true }             // m-m
parent: { type: 'relation', collection: 'pages', onDelete: 'cascade' } // self-reference
posts: { type: 'join', collection: 'posts', on: 'author' }             // 1-m, on `authors`
```

| Field      | Options                                                                                       | Where                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `relation` | `collection` (target), `many`, `onDelete`, `label`, `required`                                | top level, in groups and in items, in collections and globals; targets collections only |
| `join`     | `collection` (source), `on` (path to a relation there, e.g. `author` or `seo.image`), `label` | top level of collections only; not stored                                               |

- Ids live in the document JSON: a string, or a string array with `many`. Writes check that every id exists in the target collection and that a document does not reference itself (400). `many` arrays keep their order and reject duplicates. A required `many` relation needs at least one id.
- `defineCms` also checks `collection` and `join.on` at the type level: a typo shows as an error in `integral.config.ts`, naming the field path and the allowed values.
- `defineCms` throws at startup for an unknown target, a `join` whose `on` is not a relation to its own collection, `required` with `onDelete: 'set-null'`, a `join` in a global or group, `cascade` in a global, and `populate.depth` above `populate.maxDepth`.
- Filters accept single top-level relations (`where: { author: id }`), not `many` relations, relations in groups or joins.
- `create` and `update` return ids.

Reads resolve relations into documents:

```ts
cms.find("posts"); // every relation, default depth
cms.find("posts", { depth: 1 });
cms.find("posts", { populate: false }); // ids only
cms.find("posts", { populate: { author: { avatar: true }, tags: true } });
cms.find("pages", { populate: { seo: { image: true } } }); // through a group
cms.find("authors", { populate: { posts: true } }); // join
```

- `populate: true` (default) resolves every relation up to `depth` hops. Group keys do not count as hops.
- A `populate` object resolves only the listed paths: `true` is one hop, a nested object goes further. `depth` is ignored then. `true` on a group key resolves every relation in the group one hop.
- A `join` resolves only when named in a `populate` object, else it is absent. It returns all matching documents, newest first, with their own relations as ids unless nested paths say otherwise.
- A missing target resolves to `null`, and is dropped from a `many` array. Cycles end at the depth limit.
- Result types follow the options, and invalid `populate` keys are type errors.
- One query per relation or join field per hop.

`defineCms({ populate: { depth: 2, maxDepth: 5 } })` sets the defaults: `depth` for `populate: true` (default 2), `maxDepth` for HTTP requests (default 5; the local API has no limit).

Over HTTP: `?populate=false`, `?populate=author.avatar,tags`, `?depth=3`. The client turns a `populate` object into these paths. Unknown paths, fields that cannot populate and more hops than `maxDepth` return 400 with the path in the message (`Invalid populate: author.nope`, `Invalid depth: 9`).

When a document is deleted, every relation that points to it applies its `onDelete` rule, all in one transaction and with the hooks of the referencing documents:

- `set-null` (default): a single relation becomes `null`, a `many` array drops the id.
- `restrict` (default for `required`): the delete throws `ConflictError` (exported from `integral-cms`) and changes nothing. HTTP returns 409 with `{ message, references }`, each reference `{ collection, id }` or `{ global }`.
- `cascade`: the referencing documents are deleted too, recursively, with their own rules.

Known limits:

- Restrict is checked per document as the cascade reaches it. A `restrict` reference from a document that a later cascade step would delete still blocks the whole delete.
- Joins and delete checks scan the source collection with `json_extract` / `json_each`. That is fine up to roughly 10k–50k documents per collection. Indexes can come later without API changes.

### Lists and blocks

An `array` is a list of items that share one set of fields. A `blocks` field is a list where each item picks its fields by a block name:

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

`fields`, `blocks`, `minRows`, `maxRows` and `labels` are in [Field options](#field-options). `labels.singular` names the add button in the admin ("Add Link"), and an array row ("Link 2"); a block row shows its block label. Each block takes:

| Block option  | What it does                                                         |
| ------------- | -------------------------------------------------------------------- |
| `fields`      | The fields of an item of this block                                  |
| `label`       | Name in the block picker and the row header. Default: the block name |
| `description` | Help text in the block picker                                        |
| `icon`        | A Lucide icon name for the block picker and the row header           |

Items are stored in the document JSON. Every item has a stable `id`; a block item also has its block name in `blockType`:

```json
"links":   [{ "id": "…", "label": "Docs", "page": "p1" }],
"content": [{ "id": "…", "blockType": "hero", "title": "Hi", "image": "m1" },
            { "id": "…", "blockType": "text", "body": "…" }]
```

- The server fills a missing `id` on every write, drafts included. The admin creates one for each new row, so ids stay the same across saves. An item field MUST NOT be named `id`, and a block field MUST NOT be named `blockType`.
- `required` means at least one item. `required`, `minRows` and `maxRows` apply only when the field's condition matches, and not to draft saves.
- Error paths use the position: `content.2.title`, `links.0.page`. `Unknown block` (also for a draft), `Duplicate id`, `At least 2 items` and `At most 5 items` are field errors too.
- `default`, `validate`, field hooks and slugs work inside items. Hooks get the positional `path` and the item as `siblingData`.
- Inside an item, a condition key without `/` reads a field of the same item. Conditions outside the list cannot read into it.
- `edit("pages", page.id, "content.2.title")` binds a field of an item. The admin opens that row and focuses the field.
- `update` replaces a whole list, like a group. Items you send without an `id` get a new one.

Reads treat a list like a group: `populate` and `select` go through it, and its key counts no hop. Blocks are keyed by block name:

```ts
cms.find("pages", { populate: { links: { page: true } } });
cms.find("pages", { populate: { content: { hero: { image: true } } } });
cms.find("pages", {
  select: { links: { label: true }, content: { hero: { title: true }, text: true } },
});
// HTTP: ?populate=content.hero.image&select=links.label,content.hero.title
```

- The default `populate: true` resolves relations, images and files inside items, like anywhere else. `true` on a list key resolves every relation in its items one hop, in every block.
- One query per relation field per hop (per block for blocks) covers the items of every document.
- Items always keep `id`, and block items `blockType`. A block that `select` does not name leaves `{ id, blockType }` for its items.
- Result types are a union of the blocks, so `if (block.blockType === 'hero')` narrows to the hero's fields. In written data, an item's `id` is optional; in read results, it is always there.
- `private` works inside items. A public read gets only `{ id, blockType }` for an item of a block that is not in the schema anymore.
- `onDelete` rules apply inside items: `set-null` clears the value in every item that holds the id and keeps the items.

Limits:

- Lists and fields inside them are not filterable.
- No `join` inside items, and no join `on` path into items. No `unique` inside items.
- In a localized collection or global, a top-level list is one localized key: each locale has its own list, or all share it with `localized: false`. Fields inside items MUST NOT set `localized`.
- A custom field's server `load` inside a block item finds its field through the saved document, so it needs one.
- `defineCms` throws at startup for a join, `unique` or `localized` inside items, a join `on` into items, an empty `blocks` record, a negative `minRows` or `maxRows`, and `minRows` above `maxRows`.

### Hooks

Hooks run your code at fixed points of every read, write and delete: to change data, check it across documents, add computed values or react to changes. The names follow Payload's.

```ts
import { defineCollection, ValidationError } from "integral-cms";

export const posts = defineCollection({
  fields: {
    title: {
      type: "text",
      required: true,
      hooks: { beforeChange: [({ value }) => value?.trim()] },
    },
    slug: { type: "text", required: true },
  },
  hooks: {
    beforeChange: {
      uniqueSlug: async ({ data, id, cms }) => {
        const other = await cms.findOne("posts", { where: { slug: data.slug } });
        if (other && other.id !== id) throw new ValidationError({ slug: "Already used" });
      },
    },
    afterRead: [({ docs }) => docs.map((d) => ({ ...d, url: `/blog/${d.slug}` }))],
  },
});
```

- Each stage takes an array or a record of functions. They run in order. A record lets a host leave one out by name: `const { uniqueSlug, ...rest } = posts.hooks.beforeChange`.
- A hook gets one object and MAY be async. It MAY return a replacement for its main value; `undefined` keeps it.
- Hooks run for every local API call. HTTP and the admin call the local API, so they run there too.

| Hook                             | Where                                       | Main value                | Other arguments                  |
| -------------------------------- | ------------------------------------------- | ------------------------- | -------------------------------- |
| `beforeOperation`                | collection                                  | `args` (the call's input) | `operation`                      |
| `beforeValidate`, `beforeChange` | collection, global, field                   | `data`                    | `operation`, `id`, `originalDoc` |
| `afterChange`                    | collection, global, field                   | `doc`                     | `operation`, `previousDoc`       |
| `beforeRead`, `afterRead`        | collection, global (`afterRead` also field) | `docs` (array)            | `operation`                      |
| `beforeDelete`, `afterDelete`    | collection                                  | none                      | `id`, `doc`                      |
| `afterOperation`                 | collection                                  | `result`                  | `operation`, `args`              |
| `afterError`                     | collection, `defineCms`                     | none                      | `error`, `operation`             |

Field hooks get `value`, plus `data`, `siblingData` (the group that holds the field), `originalDoc` and `path` (e.g. `seo.title`). Every hook also gets `cms` (the local API), `user` (the session user of an HTTP write, else `null`), `context` and `collection` or `global`.

Root hooks run for every collection and global. `defineCms({ hooks })` takes every stage of the table; `collection` or `global` says which one is running, and `data`, `doc` and `docs` are untyped. Globals run only their own stages. [Plugins](#plugins) add hooks the same way.

```ts
defineCms({
  hooks: {
    afterChange: [
      ({ collection, global, doc }) => console.log("changed", collection ?? global, doc.id),
    ],
  },
});
```

Order:

```
create, update, setGlobal: beforeOperation → defaults (create) → beforeValidate → validation → validate → beforeChange → validation → unique → write → afterChange → afterRead → afterOperation
find, findOne, findById, getGlobal: beforeOperation → beforeRead → populate → afterRead → afterOperation
delete: beforeOperation → beforeDelete → delete + onDelete effects → afterDelete → afterOperation
```

- At each stage, field hooks run first, in field order and depth-first into groups, then the collection's or global's, then the plugins' and last the root hooks of `defineCms`. A group's own hooks run before its fields'.
- Globals have no `beforeOperation` and `afterOperation`.
- `beforeChange` gets validated data, and its result is validated again, so a hook cannot store invalid data.
- `afterRead` runs once per read with all documents (field `afterRead` once per value). Documents loaded by `populate` run their own collection's `beforeRead` and `afterRead`, once per relation field per hop.
- `onDelete` effects run through `update` and `delete`, with all their hooks. A `set-null` update skips `validate`, since it only clears a reference, and the id checks, because other relations of that document MAY point to documents the same delete removes.

Errors:

- `throw new ValidationError({ slug: 'Already used' })` (from `integral-cms`). Keys are field paths. HTTP returns 400 with `{ message, errors: { [path]: message } }`, and the admin shows each message next to its field. The local API validates every write the same way.
- Any other error rolls back the operation and runs the collection's `afterError`, then the root one: `defineCms({ hooks: { afterError: [...] } })`. HTTP returns 500 without the message. Global operations run only the root `afterError`, with `global` set.
- Every HTTP error body has `message`, like better-auth's. The client's `CmsError` uses it as its message and keeps the body in `body`.
- `ValidationError` (400) and `ConflictError` (409) are expected and run no `afterError`. An error inside `afterError` is logged and does not replace the original.

Transactions: every write runs in one transaction with its hooks, its `onDelete` effects and every `cms` call made in them. An error rolls all of it back. Reads open none; a read inside a write uses the write's transaction. Hooks MUST use the `cms` they get, not the imported instance. On drivers without interactive transactions (Cloudflare D1, later), hooks run in the same order without isolation.

`context` is one object for all hooks of an operation and every nested call. A hook that writes to its own collection runs its own hooks again; stop the loop with `context`:

```ts
afterChange: [
  async ({ doc, cms, context }) => {
    if (context.counted) return;
    context.counted = true;
    await cms.update("posts", doc.id, { views: (doc.views ?? 0) + 1 });
  },
];
```

Types:

- `defineCollection()` and `defineGlobal()` type `data`, `doc`, `docs` and `originalDoc` from their fields. Hooks in a collection written inline in `defineCms` get untyped (`any`) arguments.
- `cms` in hooks is untyped: names and data are plain strings and records.
- Field hooks type only `value`.

Coming from Payload: the hook names are the same. `req.user` is `user`, `req.context` is `context`, `req.payload` is `cms`.

### Pages and SEO

`integral-cms/presets` gives pages with nested URLs and SEO fields. It is plain field objects and named hook records. You spread them into your own collection, so you see what you get and can omit, override and add fields and hooks.

```ts
// collections/pages.ts
import { defineCollection } from "integral-cms";
import { page, seo } from "integral-cms/presets";

export const pages = defineCollection({
  label: "Pages",
  titleField: "title",
  fields: { ...page.fields, ...seo.fields, body: { type: "textarea" } },
  hooks: page.hooks,
});
```

`page.fields`:

| Field    | Definition                                                                        |
| -------- | --------------------------------------------------------------------------------- |
| `title`  | `{ type: 'text', required: true }`                                                |
| `slug`   | `{ type: 'slug', from: 'title', parent: 'parent', path: 'path', required: true }` |
| `parent` | `{ type: 'relation', collection: 'pages', onDelete: 'restrict' }`                 |
| `path`   | `{ type: 'text', readOnly: true }`                                                |

`seo.fields` is one optional group `seo` with `title`, `description`, `image` (the social image) and `noindex`. Without [media](#media), leave `image` out (see below).

Paths are stored, so reads never compute them:

- A root page with slug `index` has path `/`. Any other root page has `/<slug>`.
- A child has `<parent path>/<slug>`, e.g. `/about/team`. A child of `/` has `/<slug>`.
- A page with children cannot be deleted (409, `restrict`), so no subtree is lost.

`page.hooks`:

| Stage          | Name               | Does                                                                                                                      |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `beforeChange` | `validParent`      | 400 on `parent` if the parent is the page itself or one of its descendants                                                |
| `beforeChange` | `buildPath`        | Sets `path` from the parent's path and the slug. It overwrites any `path` in the input                                    |
| `beforeChange` | `uniquePath`       | 400 on `slug` if another page has the same path                                                                           |
| `afterChange`  | `updateChildPaths` | When `path` changes, saves each child again with no changes, so its `buildPath` runs and the whole subtree gets new paths |

The slug itself needs no hook: `from: 'title'` fills an empty slug on the server too.

All run in the write's transaction: a failing child update rolls back the rename, and two parallel saves cannot claim the same path.

Customize with plain JavaScript:

```ts
const { image, ...seoRest } = seo.fields.seo.fields
const { uniquePath, ...beforeChange } = page.hooks.beforeChange

fields: {
  ...page.fields,
  parent: { ...page.fields.parent, collection: 'docs' }, // another collection name
  seo: { ...seo.fields.seo, fields: { ...seoRest, keywords: { type: 'text' } } },
},
hooks: { beforeChange, afterChange: page.hooks.afterChange },
```

`nestedPaths()` returns the same hooks for other field names. Every option defaults to the name in `page.fields`. The slug's `path` option MUST name the same path field, so the admin shows the right prefix:

```ts
fields: {
  name: { type: 'text', required: true },
  handle: { type: 'slug', from: 'name', parent: 'parentCategory', path: 'url' },
  parentCategory: { type: 'relation', collection: 'categories', onDelete: 'restrict' },
  url: { type: 'text', readOnly: true },
},
hooks: nestedPaths({ slug: 'handle', parent: 'parentCategory', path: 'url' }),
```

Nesting without URLs keeps only `validParent`.

Read a page by its path like any other field, and build `<head>` with `seoMeta()`:

```ts
import { seoMeta } from "integral-cms";

const [general, seo] = await Promise.all([cms.getGlobal("general"), cms.getGlobal("seo")]);
const doc = await cms.findOne("pages", {
  where: { path: "/about/team" },
  populate: { seo: { image: true } },
});
const { title, description, noindex, canonical, alternates, image, verification } = seoMeta(doc, {
  general,
  seo,
});
// HTTP: GET /api/cms/collections/pages?path=/about/team
```

The second argument is optional. It takes the [settings](#settings) globals `general` and `seo`:

- `title` is `seo.title`, or the page's `title` when it is empty, then the separator (default `·`) and the site title. Nothing is stored, so the fallback follows title changes. Without a site title, it is only the page title.
- `description` is `seo.description` or `undefined`. There is no fallback, so pages do not share one description.
- `noindex` is `true` when the page's or the site's `seo.noindex` is.
- `canonical` is the site `url` plus the page's `path`, or the page's own URL in `alternates` ([Localization](#localization)). `undefined` unless one exists.
- `alternates` is a list of `{ hreflang, href }` for the `hreflang` tags, from the read option `alternates: true`. Empty without it.
- `image` is the page's `seo.image`, else the site's, as an absolute URL when the site has a `url`. Only a populated image counts, so populate it.
- `verification` is a list of `{ name, content }` meta tags for the filled `google` and `bing` codes.
- `seoMeta()`, `breadcrumbs()`, `slugify()` and `SLUG_PATTERN` come from `integral-cms`. In browser code, import them from `integral-cms/client`, which pulls no server code.

`breadcrumbs()` builds the trail from a page read with its parents resolved. Read only what the trail needs with [`select`](#2-read-content):

```astro
---
import { breadcrumbs } from "integral-cms";

const page = await Astro.locals.integral.findOne("pages", {
  where: { path },
  populate: { parent: { parent: true } },
  select: {
    title: true,
    path: true,
    parent: { title: true, path: true, parent: { title: true, path: true } },
  },
});
const trail = breadcrumbs(page); // [{ title: 'About', path: '/about' }, …, { title: 'Person', path: '/about/team/person' }]
---

<nav aria-label="Breadcrumb">
  <ol>
    {trail.map((crumb, i) => (
      <li>
        {i === trail.length - 1 ? (
          <span aria-current="page">{crumb.title}</span>
        ) : (
          <a href={crumb.path}>{crumb.title}</a>
        )}
      </li>
    ))}
  </ol>
</nav>
```

- One entry per document from the root down to the page itself. A root page has one entry.
- The walk stops at a `parent` that is not a document: `null`, missing, or an id `populate` did not resolve. It makes no queries, so resolve as many levels as your tree has; the trail then starts at the last resolved ancestor.
- Options name the fields: `breadcrumbs(doc, { title: 'name', path: 'url', parent: 'up' })`. They default to `title`, `path` and `parent`, the names in `page.fields`. A missing title or path reads as `''`.

Each example has a catch-all route that reads by `path`. Static routes win over it, so a CMS page at `/` (or `/about` in Astro) never shows:

- Astro: `src/pages/[...path].astro` with `Astro.locals.integral.findOne` and `select`
- Nuxt: `app/pages/[...path].vue` with `useIntegral().findOne` and `useSeoMeta`
- TanStack Start: `src/routes/$.tsx` with a server function and `head`

### Settings

Most sites need a title, a URL and SEO defaults. `defineCms()` adds two globals for that, `general` and `seo`, without any config:

| Global    | Fields                                                                                        |
| --------- | --------------------------------------------------------------------------------------------- |
| `general` | `title` (required), `tagline`, `url` (`https://…`), `favicon` (image)                         |
| `seo`     | `separator` (default `·`), `image` (social image), `verification.google` / `.bing`, `noindex` |

They appear on the admin's Settings page, not in the sidebar, and read like any global: `await cms.getGlobal("general")`. An unsaved global reads as `{}`, so handle a missing `title`. Without [media](#media), `favicon` and `image` are left out.

The `settings` option drops or replaces them:

```ts
import { settings } from "integral-cms/presets";

defineCms({
  settings: {
    // Extend the default.
    general: {
      ...settings.general,
      fields: { ...settings.general.fields, analyticsId: { type: "text" } },
    },
    // Drop one. `settings: false` drops both.
    seo: false,
  },
});
```

- An omitted key is the default, `false` drops it, a global replaces it and is stored under the same name. Other keys are type errors: add your own settings pages as globals with `nav: { display: "settings" }` (see [Customize the admin](#customize-the-admin)).
- A host or plugin global named `general` or `seo` throws at startup while that default is on.
- A replacement is taken as is: an `image` field in it needs media.

### Live preview

`permalink` on a collection or global is the template of the document's public URL; your routes MUST serve it. `preview` defaults to it and tells the admin where a document renders. The admin opens that page next to the form and pushes every unsaved edit into it. Set `preview` only when the iframe shows another page.

In the admin, "Visual Editor" in the top bar opens `/presentation`: the site in a frame, with edit mode on. A click on a bound element opens its document next to the page (`/presentation/collections/:name/:id`, `/presentation/globals/:name`); the eye button on a document opens the same view. The perspective menu in the top bar switches the admin and its previews between drafts and published documents.

```ts
posts: {
  // Placeholders walk into groups and through one relation. A missing value means no preview.
  permalink: "/{category.slug}/{slug}",
  fields: { ... },
},
notes: {
  // Or a function of the unsaved form state and the local API. `null`: no preview.
  permalink: async (doc, { cms }) => (doc.slug ? `/notes/${doc.slug}` : null),
  fields: { ... },
},
```

The pages preset has `page.permalink` (`"{path}"`): add `permalink: page.permalink` to the collection. A placeholder that names no stored field throws at startup.

On the site, mark what a field renders with `edit()` and start the runtime with `preview()`. It is safe on every page: visitors without a session see nothing.

```ts
import { edit, preview } from "integral-cms/preview";

preview();
// <h1 data-cms={edit("posts", post.id, "title")}>{post.title}</h1>
// <img data-cms={edit("posts", post.id, "hero")} data-cms-attr="src,srcset,alt" src={post.hero.src} />
// Globals pass `null` as the id: edit("general", null, "title")
```

Bound elements get the typed text, or the listed attributes, on every keystroke. With edit mode on, a click on one focuses its field in the admin.

The runtime picks its mode from `window.name`:

- In the admin's preview iframe it applies the unsaved state, without a bar.
- In a preview the admin opened in a tab, it also shows the **admin bar** with an "Edit" switch and "Exit preview".
- On any other page, a signed-in editor gets the **admin bar**. Visitors download nothing extra: the bar loads only when the `integral-session` cookie is set, which sign-in sets and sign-out clears.

`preview({ admin: "/cms" })` sets the admin path for the links (default `/admin`); `admin: false` turns the admin bar off on the site. The Astro and Nuxt adapters pass their own `admin` option.

Vue and React pages can re-render from the unsaved state too, so lists and conditions follow. `useDraft()` merges it into the document and starts the runtime. The merge is recursive: items of an `array` or `blocks` field match by `id`, and a relation whose ids did not change keeps its populated value:

```ts
import { useDraft } from "integral-cms/preview/vue"; // or integral-cms/preview/react
const post = useDraft("posts", data); // Vue: a ref; React: the merged value
```

Per framework:

- **Astro**: the integration injects `preview({ morph: true })` into every page. `integralCms({ preview: false })` leaves it out. Astro pages render on the server, so while you type only bound elements update. After each draft save, the runtime fetches the page again (with the preview cookie, so it renders the drafts) and morphs `<body>` and the title into it. Prerendered pages fetch their static HTML, so they only get the bound-element updates.
- **Nuxt**: the module starts the runtime in a client plugin, and `useIntegral()` merges the unsaved state into the `data` of `find`, `findOne`, `findById` and `getGlobal`. Pages only add `edit()`.
- **TanStack Start and other Vite hosts**: call `preview()` once in the root component, in a `useEffect`, and pass loader data through `useDraft()`:

```tsx
// src/routes/__root.tsx
useEffect(() => preview(), []);
// src/routes/posts/$slug.tsx
const post = useDraft("posts", Route.useLoaderData());
```

#### Admin bar

The admin bar is a floating pill with your brand, an Edit button, the Drafts / Published menu and a dismiss button. Edit opens the visual editor with the current page URL, including its query and fragment. Dismiss hides the bar for this page. Preview tabs show only Back to visual editor, an Edit preview switch for selecting fields, and a close button. Closing preview disconnects live updates, removes overlays and restores the normal bar without reloading the page.

The pill defaults to `bottom-center`, 16 px from the viewport edge, with safe-area spacing. The eight positions are `top-left`, `top-center`, `top-right`, `center-left`, `center-right`, `bottom-left`, `bottom-center` and `bottom-right`. It stays visible while editing or focused; otherwise it hides on downward scroll. The normal bar renders every item inline in its sorted order, including custom items. On phones it uses at most 95% of the viewport width; items scroll horizontally with edge fades and the dismiss button stays visible. The bar and its portals use a shadow root; the visual editor runs on its own admin page.

```ts
// integral.config.ts
import { clientRef } from "integral-cms/admin";

defineCms({
  admin: {
    // Omitted: bottom-center with the built-in items. `false`: no bar.
    adminBar: {
      position: "bottom-center",
      // The key is the item's id.
      items: {
        // A link. `load` runs on the server and may override `label`, `icon`, `href` and `children`.
        analytics: {
          label: "Analytics",
          icon: "chart-bar",
          order: 40,
          load: ({ url }) => ({
            href: `https://analytics.example.com/?url=${encodeURIComponent(url)}`,
          }),
        },
        // A button. `load` gives the handler its data as `ctx.data`.
        hello: {
          label: "Say hello",
          onClick: clientRef("./src/admin/bar.ts#sayHello"),
          load: ({ user }) => ({ editor: user.name }),
        },
        // Removes a built-in item.
        perspective: false,
      },
    },
  },
});
```

`admin.adminBar.items` is an object of registrations; the key is the item's id. A later registration with the same key replaces the earlier one in place (it replaces the whole item, with no field merge). An item has an `order` and an `icon`, and is one of:

- a link (`href`) or a dropdown (`children`), rendered by the bar. `children` is an object keyed by id like `items`, and an id is unique across the bar, children included. A child takes everything an item takes, except its own `children`. A loader may replace the children for the request with an object of the same shape;
- a button: `onClick: clientRef(...)`, run in the browser with the latest item context;
- a custom control: `mount: clientRef(...)`, the same `mount(el, ctx)` contract as fields and pages;
- `false` instead of an item, which removes the item with that key, built-ins included, before any loader or browser code runs.

`mount` cannot be combined with `href`, `onClick` or `children`, and `onClick` not with `href` or `children`; both throw at startup, as does a missing `label`. `load` is optional and runs on the server for every bar request, with `{ user, cms, locale, url }`. `url` is the page the bar shows on; it comes from the browser and is never fetched. For a link or dropdown, the result is an overlay of `label`, `icon`, `href` and `children`, and `null` hides the item for that request. For a button or a custom control, the result is any JSON and arrives as `ctx.data`; `null` is valid data. Each item only sees its own data. A loader that throws or returns something invalid is logged and the item is skipped; the rest of the bar stays. `ctx.integral.reload()` runs one item's loader again.

The bar is one flat row sorted by `order`, then by registration order; items without `order` follow. Built-ins: `dashboard` 10, `edit` 20, `perspective` 30. Plugins add items with `admin.adminBar.items`, see [Plugins](#plugins). They compose in this order: built-ins, plugins in plugin order, the host. Preview tabs show the fixed `edit` (10) and `live-edit` (20) controls; custom items and their loaders do not run there. `position` and `adminBar: false` belong to the host.

An item with `mount(el, ctx)` renders its own element with plain DOM, like the admin's extension slots. It returns a cleanup function or `{ update(ctx), unmount() }`; `update` gets the new context, e.g. after a perspective change. `el` sits in the bar's shadow root, so the page's CSS does not reach it: style it inline. See the example plugin, `packages/plugins/src/example/`.

### Drafts

Every document and global has a published version and MAY have a pending draft. Reads return the meta with them: `publishedAt` (`null` if never published) and `hasDraft`.

Reads run in one of two perspectives:

- **published** (default): only published documents, with their published data.
- **drafts**: every document, with its draft where one is pending. Filters, relations and joins use the draft data too.

```ts
await cms.find("posts"); // published
await cms.withDrafts().find("posts"); // drafts
```

Server-rendered pages get the perspective of the visitor with `withSession()`. It returns the instance with the session user, and in the drafts perspective when the request carries the preview cookie set to `drafts` and a valid session:

```ts
const integral = await cms.withSession(request);
const posts = await integral.find("posts");
```

The Astro middleware does this, so `Astro.locals.integral` is already bound to the request. Nuxt's `useIntegral()` reads over HTTP with the request's cookies, so the HTTP rule below covers it. In TanStack Start, call it in server functions with `getRequest()` from `@tanstack/react-start/server`.

Writes publish by default. A draft save keeps the published data and stores the change as the pending draft:

```ts
const post = await cms.create("posts", { title: "Soon" }, { draft: true }); // never published
await cms.update("posts", post.id, { body: "..." }, { draft: true });
await cms.publish("posts", post.id); // validates, then publishes the draft
await cms.discard("posts", post.id); // drops the draft; a never-published document is deleted
await cms.setGlobal("general", { title: "New" }, { draft: true });
await cms.publishGlobal("general");
await cms.discardGlobal("general");
```

A draft save runs defaults, slugs, `beforeValidate` and `beforeChange`, and checks types only: `required`, `pattern`, `min`, `max`, `validate`, `unique` and relation ids wait for the publish. `afterChange` runs only on publish. A publish runs every check and hook of an update on the draft; when one fails, it throws a `ValidationError` and the draft stays. Hooks see `draft: true` on a draft save and `false` otherwise.

`drafts: false` on a collection or global turns this off: `{ draft: true }` and `discard` throw a `ValidationError`. The media library has no drafts.

Over HTTP, with a session: `POST /api/cms/collections/:name/draft`, `PUT /api/cms/collections/:name/:id/draft`, `POST /api/cms/collections/:name/:id/publish`, `DELETE /api/cms/collections/:name/:id/draft` (204 when it deleted), `PUT /api/cms/globals/:name/draft`, `POST /api/cms/globals/:name/publish` and `DELETE /api/cms/globals/:name/draft`. The client has `createDraft`, `updateDraft`, `publish`, `discard`, `setGlobalDraft`, `publishGlobal` and `discardGlobal`.

The preview cookie (`integral-preview`) holds the perspective: `drafts` or `published`. `POST /api/cms/preview` sets it, with an optional body `{ "perspective": "published" }` (default `drafts`), and `DELETE /api/cms/preview` clears it; both need a session. It is not `HttpOnly`, so the preview runtime can read it. In the browser, call `client.preview.enter(perspective?)` and `client.preview.exit()`. HTTP reads follow the same rule: drafts only with `integral-preview=drafts` and a session, so the cookie alone shows nothing.

### Localization

Editors write a document in several languages. Each locale has its own draft and publish state. Fields that do not change per language are stored once.

```ts
defineCms({
  localization: {
    locales: ["en", "de"],
    defaultLocale: "en",
    // Default true. A missing value or locale reads as the default locale's.
    fallback: true,
    // Default { prefix: "except-default" }: /about and /de/about. "always": /en/about too. `false`: you route on your own.
    routing: { prefix: "except-default" },
  },
  collections: {
    posts: defineCollection({
      // Fields are localized unless they set `localized: false`.
      localized: true,
      permalink: "/posts/{slug}",
      fields: {
        title: { type: "text", required: true },
        slug: { type: "slug", from: "title", required: true },
        hero: { type: "image", localized: false }, // shared by all locales
      },
    }),
  },
});
```

- `localized: true` on a collection or global turns it on. It needs `localization`, or startup throws. The `media` collection MUST NOT be localized.
- `localized: false` on a field shares it. A group, an `array` and a `blocks` field are localized as a whole: fields inside them MUST NOT set `localized`. Joins are never stored, so they are never localized.
- Relation, image and file fields MAY be localized.
- With `localization` set, the default `general` and `seo` globals are localized.
- `defaultLocale` MUST be one of `locales`; `locales` MUST NOT be empty or hold duplicates.
- Collections and globals without `localized` behave as before and ignore `locale`. A `locale` without `localization` throws a `ValidationError`.

#### Reads

```ts
await cms.find("posts", { locale: "de" });
await cms.findOne("posts", { where: { slug: "hallo" }, locale: "de", fallback: false });
await cms.getGlobal("general", { locale: "de" });
// HTTP: GET /api/cms/collections/posts?locale=de&fallback=false
```

- `locale` defaults to `defaultLocale`, `fallback` to the config. An unknown locale throws a `ValidationError` (400).
- With `fallback`, a missing value (or `null`) reads as the default locale's, and a document published only in the default locale is still visible. Without it, a document needs a published version in the requested locale.
- `where` filters and `unique` follow the same fallback: a filter matches the value the read returns.
- `populate` reads related documents in the same locale. Hooks and their nested `cms` calls inherit it; every hook gets `locale`.
- Documents of a localized collection carry `locale` (the locale of the read), `locales` (the locales with a version: published ones, or every one with a row in the drafts perspective) and `sharedDraft` (the shared fields have a pending draft). Globals get the same three. `select` lists them like `id`.
- `alternates: true` adds `alternates` to a document, one URL per published locale and `"x-default"`, the default locale's. It needs a `permalink` on the collection, costs one batched read per locale and is typed only when the option is set.

#### Writes, drafts and publishing

```ts
const post = await cms.create("posts", { title: "Hello" }, { locale: "en", draft: true });
await cms.update("posts", post.id, { title: "Hallo" }, { locale: "de", draft: true });
await cms.publish("posts", post.id, { locale: "de" });
await cms.discard("posts", post.id, { locale: "de" }); // only the German draft
await cms.discard("posts", post.id, { all: true }); // every draft, shared fields included
```

- Writes default to `defaultLocale`. A document MAY be created in any locale.
- Defaults, hooks and validation run on the whole document: the shared fields plus the fields of the written locale.
- Shared fields live on the document, localized ones in one row per locale. A draft is saved per locale. A publish publishes that locale and the pending shared fields, so `required` is checked for the published locale only.
- `discard` drops one locale's draft and keeps the shared draft, because another locale MAY have edited it. A locale that was never published loses its row, and a never-published document is deleted. `{ all: true }` ignores `locale`.
- Over HTTP, every write route takes `?locale=`; `DELETE …/draft?all=true` drops all drafts.

Copy the fields of one locale into another as a draft, or delete a translation:

```ts
await cms.copyLocale("posts", id, { from: "en", to: "de" }); // replaces the pending German draft
await cms.removeLocale("posts", id, "de"); // the default locale and the last locale stay
await cms.copyGlobalLocale("general", { from: "en", to: "de" });
await cms.removeGlobalLocale("general", "de");
// HTTP: POST /collections/:name/:id/locales/:to/copy { "from": "en" }, DELETE /collections/:name/:id/locales/:locale
```

References that point to a document are found in locale rows too, so `onDelete` (`restrict`, `set-null`, `cascade`) and media usage see every locale.

#### Changing the config

`localized` options and `defaultLocale` MAY change later. On the first database access, the CMS compares the localized fields with the last run and moves the values: shared to the default locale's row, or back. Other locales keep their rows, and reads ignore their values while a field is shared, so switching back restores them. Each move is logged, for example `moved posts.title to locale rows (12 documents)`. A changed `defaultLocale` moves nothing and logs a warning with the number of documents that have no row in it. A locale removed from `locales` keeps its rows; reads ignore them.

#### URLs, `hreflang` and the language switch

`permalink` is the template of a document's public URL, with the same forms as `preview`. Your routes MUST serve it. With `routing`, keep templates free of the locale: the CMS adds the prefix (`/posts/{slug}` becomes `/de/posts/hallo`). With `routing: false`, a template MAY use `{locale}`.

Pure helpers, from `integral-cms` and `integral-cms/client`:

```ts
import { localeFromPath, localizePath, switchTarget } from "integral-cms/client";

localeFromPath("/de/about", localization); // { locale: "de", path: "/about" }
localizePath("/about", "de", localization); // "/de/about"
switchTarget(localization, "/about", "de", page.alternates);
```

`switchTarget()` uses the document's alternate in the target locale, or that locale's homepage when the translation is missing. `localization` is `cms.localization` on the server. In the browser, `await client.localization()` fetches the public `GET /api/cms/localization` once per client (`null` without `localization`), so the browser never imports `integral.config.ts`.

`seoMeta()` turns `alternates` into `hreflang` tags: `alternates` is a list of `{ hreflang, href }`, absolute against the site `url`, and `canonical` is the URL of the page's own locale.

```astro
---
const { canonical, alternates } = seoMeta(page, { general, seo });
---
<html lang={Astro.locals.locale}>
  <head>
    <link rel="canonical" href={canonical} />
    {alternates.map((a) => <link rel="alternate" hreflang={a.hreflang} href={a.href} />)}
  </head>
</html>
```

- **Astro**: the middleware sets `Astro.locals.locale` and `Astro.locals.path` (the path without the prefix) from the URL. Read with `{ where: { path: Astro.locals.path }, locale: Astro.locals.locale, alternates: true }` and pass the document's `alternates` to the header and language switch. The catch-all route serves prefixed URLs as they are. Other routes MUST exist for the prefixed URLs too, for example under `src/pages/[...locale]/`; the integration adds no route folder.
- **Nuxt**: `useLocale()` returns `locales`, `defaultLocale`, `locale`, `path`, `localePath(path, locale?)`, `switchLocalePath(locale)` and `switchLocale(locale)`. `useAlternates(() => page.value?.alternates)` registers the page's translations. `switchLocalePath()` returns a translation's URL, or the locale's homepage when it is missing; `switchLocale()` navigates there. Render the header inside the page after its document loads so server-rendered language links have the alternates. `useIntegral()` reads in the route's locale unless the options set one.
- **TanStack Start and others**: `client.localization()` plus the helpers above.

#### Admin

When `localization` is set, the top bar has a language menu next to the perspective menu. The choice is kept in the browser and reloads nothing; an admin URL with `?locale=` sets it. Collections and globals that are not localized ignore it.

- The form edits the active language. Empty localized fields show the default language's value as a placeholder, and shared fields carry a "Same in all languages" marker.
- The document header shows the active language's state (Published, Draft, Not translated) and a row of language codes with status dots; a click switches the language.
- The "…" menu has "Copy from…", "Copy to…", "Remove translation" and "Discard all changes". Each asks first.
- Lists show the active language with fallback and mark rows that have no translation.
- Live preview opens the page of the active language, and the admin bar's Edit link on a site page carries the page's `<html lang>`.

#### Site strings

Short texts a site hardcodes, like a "Read more" button, go into a `strings` global. Each key becomes a text field that editors translate on the Settings page:

```ts
import { strings } from "integral-cms/presets";

defineCms({
  globals: {
    strings: strings({
      readMore: { label: "Read more link", default: { en: "Read more", de: "Weiterlesen" } },
      subscribe: "Subscribe",
    }),
  },
});

const text = await cms.getGlobal("strings", { locale, fallback: false });
text.readMore; // the stored text, else the code default of `locale`
```

- A default is one text for every locale, or one per locale. A locale without an entry gets the first one.
- `{ label, default }` sets the field label in the admin. Without it, the label is the key. In this form, no locale MAY be named `default`.
- Read with `fallback: false`. Otherwise a text stored in the default locale wins over another locale's code default.
- A text equal to its code default is not stored, so a later change of a code default reaches every locale that did not change that text.
- Read the global once per page, e.g. in the layout, and pass the texts down.
- The global is localized, so it needs `localization`.

The `redirects` plugin has a `locale` field. A redirect without one applies to every locale, `from` is unique per locale, and `resolveRedirect(cms, path, locale?)` and `GET …/redirects/lookup?path=&locale=` prefer the locale's redirect.

### Media

Every instance has a media library: uploads into folders, `image` and `file` fields, and responsive images. Files live on the local disk or in S3 (any S3-compatible service, R2 included).

Without a `media` option, or with `media: true`, files go to `./.uploads` and images get WebP variants at quality 85, rendered at upload. That is `local({ dir: resolve('.uploads') })` and `ipx({ prerender: true })`. `media: false` turns the library off. For your own storage, limits or images, pass an object:

```ts
import { defineCms } from "integral-cms";
import { local } from "integral-cms/media/local";
import { ipx } from "integral-cms/media/ipx";

export default defineCms({
  // ...
  media: {
    storage: local({ dir: "/var/lib/my-site/uploads" }),
    maxSize: 5 * 1024 ** 3,
    accept: ["image/*", "video/*", "application/pdf"],
    images: {
      provider: ipx(),
      presets: { avatar: { width: 128, height: 128, fit: "cover" } },
    },
    hooks: { afterUpload: [scan] },
  },
});
```

| Option                            | Default                        | What it does                                       |
| --------------------------------- | ------------------------------ | -------------------------------------------------- |
| `storage`                         | required                       | `local()` or `s3()`, or your own adapter           |
| `maxSize`                         | 100 MB                         | Largest accepted file                              |
| `accept`                          | all types                      | Allowed MIME types, `type/*` wildcards allowed     |
| `images`                          | `false`                        | Responsive variants, or `false` for originals only |
| `images.provider`                 | required with `images`         | `ipx()`, `cloudflare()`, or your own               |
| `images.format`, `images.quality` | `'webp'`, `85`                 | Default modifiers                                  |
| `images.sizes`                    | `[320, 640, 1024, 1536, 1920]` | Widths for `srcset`                                |
| `images.presets`                  | `{}`                           | Named modifier sets                                |
| `images.maxSize`                  | 50 MB                          | Larger images get dimensions but no variants       |
| `hooks`                           | none                           | Media hooks, see below                             |

With `media: false`, core adds no routes, and `image` and `file` fields throw at startup. `media` is a reserved collection, plugin and route name.

`nuxt preview` runs the server from inside `.output/`, so a relative `./.uploads` lands in the build output. Pass an absolute `dir` there, as the Nuxt example does.

On Cloudflare Workers (the `workerd` export condition), `integral-cms/media/local`, `integral-cms/media/ipx` and the default throw, because they need a filesystem and sharp. There, no `media` option means no media library, and `media: true` throws. Use `s3()` and `cloudflare()`.

Fields store the media id like a relation, and reads resolve it:

```ts
hero: { type: 'image', required: true, image: { sizes: [800, 1600], quality: 70 } },
avatar: { type: 'image', maxSize: 2 * 1024 ** 2, image: { preset: 'avatar' } },
gallery: { type: 'image', many: true, onDelete: 'set-null' },
attachments: { type: 'file', many: true, accept: ['application/pdf'] },
download: { type: 'file', folder: 'downloads' },
```

- A populated `image` is an `Image`: `url` (the original), `src`, `srcset`, `width`, `height`, `alt`, `mimeType`, `size`, `folder`, `filename` and `key`. A `file` is a `File`, without `src`, `srcset` and the dimensions. With `populate: false` both are ids.
- `src` and `srcset` come from the field's `image` options: `images.format` / `quality`, then the preset, then the field's modifiers. Widths at or above the original's are dropped. A fixed `width` without `sizes` gives `1x` / `2x`.
- `accept` and `maxSize` are checked on write against the file (400 on the field). An `image` field takes `image/*` only.
- `onDelete` defaults to `'restrict'`: deleting a used file is a 409 with `references`. `'set-null'` is allowed, `'cascade'` is not.
- `folder` is where "Upload new" in the admin uploads to.
- `populate` and `select` take `true` on an image or file, nothing deeper.

Media documents live in the `media` collection. Read them with `find('media')` or `GET /api/cms/collections/media`; write them only through the media API. Collection and root hooks do not run for `media`.

```ts
const doc = await cms.media.upload(bytes, {
  folder: "blog",
  filename: "hero.jpg",
  mimeType: "image/jpeg",
});
await cms.media.update(doc.id, { alt: "Harbour at dusk" });
await cms.media.update(doc.id, { folder: "blog/2026" }); // moves the file
await cms.media.renameFolder("blog", "news");
await cms.media.delete(doc.id);
```

`client.media` has the same methods over HTTP, plus `folders()`. `client.media.upload(file, { folder, onProgress, signal })` uploads in parts, 4 at a time, and retries a failed part 3 times. The admin uses it; a site MAY use it too.

- A name that is taken gets a counter on upload (`hero-1.jpg`). A rename never does: a taken name is 400 `Already used`. Names compare case-insensitively.
- Folders are the `folder` strings of their files. A folder exists while it holds a file.
- Storage changes first, then the database, then storage cleanup. A failure leaves at most a stray file, never a document without its file.

#### Storage

`local({ dir, partSize = 16 MB, baseUrl? })` keeps files in `dir`, one folder per media folder. Core serves them at `/api/cms/media/files/<key>` (with `Range` support), or set `baseUrl` when your web server serves `dir`.

- It needs a persistent disk: Node, Bun or Deno on a server. Not for Workers or ephemeral serverless filesystems.
- Parts go through your server. **Every part is one request of up to `partSize`**, so a reverse proxy's body limit (nginx `client_max_body_size`) MUST be larger than `partSize`.

`s3({ bucket, region, endpoint?, accessKeyId, secretAccessKey, publicUrl, partSize = 16 MB })` signs with `aws4fetch` (install it), so it runs on Node and Workers. The browser uploads parts straight to the bucket. `publicUrl` is where the bucket is public.

- Bucket CORS MUST allow `PUT` from the admin origin and expose the `ETag` header. Without `ETag` an upload fails with a message that names the CORS setting.
- Add a lifecycle rule that aborts incomplete multipart uploads after one day.
- R2: `region: 'auto'`, `endpoint: 'https://<account>.r2.cloudflarestorage.com'`. MinIO: `endpoint: 'http://localhost:9000'` (`docker run -p 9000:9000 minio/minio server /data`).

Unfinished uploads are aborted after 24 hours. Uploads of up to 10 000 parts; the part size grows for larger files.

#### Image providers

- `ipx({ prerender? })` from `integral-cms/media/ipx` (`ipx` and sharp come with integral-cms): core renders variants on first request at `/api/cms/media/img/<modifiers>/<key>` and stores them under `.variants/<key>/`. Only modifier sets your config can produce are served. `prerender: true` renders them all right after upload.

After changing image options, run `cms.media.regenerate()` (or "Regenerate variants" on the admin's Media page). It deletes stored variants the options no longer produce and, with `prerender`, renders missing ones; `force: true` re-renders all of them, e.g. after a sharp upgrade. It exists only for providers with `render`: with `cloudflare()` nothing is stored, and new URLs take effect on their own. `POST /api/cms/media/:id/regenerate` does one file.

- `cloudflare()` from `integral-cms/media/cloudflare`: URLs for Cloudflare's image transformations (`/cdn-cgi/image/...`) on your zone. Core renders nothing.
- Your own: an object with `getImage(src, modifiers)` that returns `{ url }`, for imgproxy, Bunny or Vercel, and optionally `render(key, modifiers, storage)` for core to serve.

SVG and images above `images.maxSize` get the original as `src` and an empty `srcset`.

#### Media hooks

In `media.hooks` and on plugins as `mediaHooks`. The host's run first, then each plugin's. They get `cms` and `user` and run in the operation's transaction, except `afterDelete`.

| Hook                           | When                          | Gets                                             | Can                                                   |
| ------------------------------ | ----------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| `beforeUpload`                 | before any bytes              | `data`: `folder`, `filename`, `mimeType`, `size` | return changed `folder` / `filename`; throw to reject |
| `afterUpload`                  | file stored, document created | `doc`, `read()`                                  | throw to delete document and file                     |
| `beforeChange` / `afterChange` | `alt` edits                   | `data` / `doc`                                   | change data; react                                    |
| `beforeMove` / `afterMove`     | filename or folder change     | `doc`, `from`, `to`                              | throw to block; react, e.g. purge a CDN               |
| `beforeDelete` / `afterDelete` | delete                        | `doc`                                            | throw to block; react after the file is gone          |

`read()` streams the file from storage; with S3 it costs a GET.

### Astro

```ts
// astro.config.ts: needs an SSR adapter, e.g. @astrojs/node
import integralCms from "integral-cms/astro";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  integrations: [integralCms()], // reads ./integral.config.ts, options: { entry, admin }
});
```

The integration adds a middleware that exposes the instance as `Astro.locals.integral`, fully typed. It is `cms.withSession(request)`, so the admin's preview sees drafts; prerendered pages and `/api/cms` get the plain instance.

```astro
---
export const prerender = false;
const posts = await Astro.locals.integral.find("posts");
---
```

Pages with `prerender = false` read live content. Prerendered pages read content at build time.
Secrets go through `astro:env`; see `examples/astro/integral.config.ts`.

### Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["integral-cms/nuxt"], // reads ./integral.config.ts, options: integralCms: { entry, admin }
  runtimeConfig: { cmsSecret: "", databaseUrl: `file:${resolve("cms.db")}` },
});
```

`integral.config.ts` can call `useRuntimeConfig()` for the secret and database URL.

The module auto-imports `useIntegral()`. It has the read methods of the client (`find`, `findOne`, `findById`, `getGlobal`) but returns `useAsyncData` results.
During SSR it calls the CMS in-process; on client-side navigation it fetches the public read API.
Read options and document IDs accept refs or getters. Use a getter for route-dependent filters so reused pages update on navigation; the route's locale updates automatically. Keep `seoMeta()` in a computed and pass getters to `useHead()` or `useSeoMeta()` so the head follows the document.

```vue
<script setup lang="ts">
const { data: posts } = await useIntegral().find("posts");
const { data: post } = await useIntegral().findOne("posts", { where: { slug: "hello" } });
const route = useRoute();
const { data: current } = await useIntegral().findOne(
  "posts",
  () =>
    ({
      where: { slug: String(route.params.slug) },
      alternates: true,
    }) as const,
);
useAlternates(() => current.value?.alternates);
</script>
```

Server routes can import the instance as the default export of `#integral/config` (an alias for `integral.config.ts`) for writes or custom queries.

### TanStack Start

No module needed. A splat server route hands API requests to the CMS. `integralAdmin()` builds the admin, and a server route serves its page:

```ts
// src/routes/api/cms/$.ts
const handle = ({ request }: { request: Request }) => cms.fetch(request);

export const Route = createFileRoute("/api/cms/$")({
  server: { handlers: { GET: handle, POST: handle, PUT: handle, DELETE: handle } },
});
```

```ts
// vite.config.ts
import { integralAdmin } from "integral-cms/vite";

export default defineConfig({ plugins: [tanstackStart(), nitro(), viteReact(), integralAdmin()] });
```

```ts
// src/routes/admin.$.ts
import html from "#integral/admin-html";

export const Route = createFileRoute("/admin/$")({
  server: {
    handlers: {
      GET: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
    },
  },
});
```

```tsx
// src/routes/index.tsx: loaders run on client and server, so read content in a server function
import cms from "../../integral.config";

const getPosts = createServerFn().handler(() => cms.find("posts"));

export const Route = createFileRoute("/")({ loader: () => getPosts(), component: Home });
```

`integralAdmin()` also keeps `integral-cms` external in the SSR build, because bundling it breaks libsql's native binding.

### Any other framework

Send `/api/cms/*` to `cms.fetch(request)`. With Vite, use `integralAdmin()` as in TanStack Start and return `#integral/admin-html` for `/admin` and `/admin/*`. Otherwise serve a page of its own with an empty element and mount into it:

```ts
import { mountAdmin } from "integral-cms/admin/mount";

mountAdmin("#admin");
```

## Email

Email is optional and server-side. Configure a transport and sender once:

```ts
import { defineCms } from "integral-cms";
import { smtp } from "integral-cms/email/smtp";

export default defineCms({
  // Your collections, database and secret…
  email: {
    adapter: smtp({
      host: process.env.SMTP_HOST,
      port: 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    }),
    from: "My Site <hello@example.com>",
  },
});
```

`smtp()` uses Nodemailer 10's ESM build and connects only when sending. For STARTTLS, use port 587 and `secure: false`; the adapter requires TLS by default. Nodemailer documents Workers support with Node.js compatibility. For Workers use port 465 with `secure: true` and leave pooling off; port 25 is blocked. This does not enable the CMS's other planned Workers features.

Pass Nodemailer's native SMTP options directly to `smtp()`. This includes authentication, TLS, timeouts and connection pooling; the adapter forwards them to `nodemailer.createTransport()`. Your explicit options override the adapter's `requireTLS: true` default:

```ts
adapter: smtp({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  connectionTimeout: 10_000,
  tls: { minVersion: "TLSv1.2" },
}),
```

Any server code can send, including an Astro route or Nuxt server endpoint, without a plugin:

```ts
import cms from "./integral.config";

await cms.email.send({
  to: "team@example.com",
  replyTo: "reader@example.com",
  subject: "Contact request",
  text: "I would like to know more.",
  html: "<p>I would like to know more.</p>",
});
```

`to` accepts a string or array. Supply `text`, `html`, or both. The configured `from` applies to every message. Without email configuration, sending rejects with a configuration error. SMTP and adapter failures reject the call. SMTP acceptance does not guarantee inbox delivery; partial recipient rejection can happen after other recipients accept the message.

The browser calls a framework endpoint with `fetch()` or Nuxt's `$fetch()`. For an endpoint registered through a plugin, use the existing `publicRoutes` or session-protected `routes`, including dynamic paths such as `/:topic`, and call it with `client.request('/contact/sales', { method: 'POST', body })`. Its handler can send through `c.var.cms.email.send()`. `client.request()` always targets `/api/cms`; there is no generic browser email endpoint. Hosts MUST validate input, choose recipients and templates on the server, and enforce authorization and abuse protection on submission endpoints.

With email configured, password-reset and email-verification callbacks use default text/HTML templates. Replace either renderer with a function returning `{ subject, text?, html? }`; asynchronous functions work too:

```ts
email: {
  adapter: smtp({ /* SMTP options */ }),
  from: "My Site <hello@example.com>",
  templates: {
    resetPassword: ({ user, url }) => ({
      subject: "Reset your password",
      text: `Hello ${user.name}, reset your password: ${url}`,
    }),
    verifyEmail: ({ user, url }) => ({
      subject: "Verify your email",
      text: `Hello ${user.name}, verify your email: ${url}`,
    }),
  },
}
```

The defaults escape names and URLs in HTML; replacement templates MUST escape any values they interpolate into HTML. Explicit `auth.emailAndPassword.sendResetPassword` and `auth.emailVerification.sendVerificationEmail` callbacks take precedence. Requiring verification or sending on sign-up stays an explicit Better Auth option. Auth screens and magic-link activation are separate features.

For another provider, implement `EmailAdapter` from `integral-cms`:

```ts
import type { EmailAdapter } from "integral-cms";

const adapter: EmailAdapter = {
  async send(message) {
    const response = await fetch("https://your-provider.example/send", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error("Email delivery failed");
  },
};
```

Map `message` to the provider's API as needed. It contains `from`, `to`, `subject`, optional `replyTo`, and text/HTML bodies. Core imports no SMTP runtime unless the host imports `integral-cms/email/smtp`.

Sending awaits the provider immediately, with no queue or automatic retry. In hooks, it can happen before the content transaction commits and cannot be rolled back. Use a separate delivery workflow when mail must depend on a successful commit.

## Auth

The admin signs in at `/login`. While no user exists, every admin URL leads to `/signup`, which creates the first admin. After that, sign-up is closed: `/signup` redirects to `/login`, and the sign-in shows no sign-up link. `GET /api/cms/auth-status` answers `{ setup, signUp }` for custom forms.

**Account settings** in the user menu edit the user's name, admin language and time zone (dates in forms and the publication status follow it; empty follows the device), change the password (other sessions are signed out), set a first password for users without one (`POST /api/cms/account/password`), and add or remove passkeys. Language and time zone are stored on the user as better-auth fields `language` and `timezone`, validated on write; a host's own field of the same name replaces core's.

Admins can sign in with a passkey. Core registers better-auth's `passkey()` plugin with the host name of `site` as the relying party ID (without `site`: `localhost`) and the admin `name` as its display name. Add your own `passkey()` to `auth.plugins` to configure it; it replaces core's. Adding a passkey needs a recent sign-in.

The admin's **Forgot password?** link sends a reset email and opens a form for a new password. It needs the `email` configuration above or your own `auth.emailAndPassword.sendResetPassword` callback. Requests show the same confirmation for existing and unknown accounts; invalid or expired links offer a new request. Custom admin paths work, and a successful reset returns to sign-in.

Host apps can use `client.requestPasswordReset({ email, redirectTo })` and `client.resetPassword({ token, newPassword })` for their own forms. `redirectTo` is the trusted URL of that form. Better Auth checks password rules and token expiry, and consumes a successful reset token once. Existing-session revocation follows `auth.emailAndPassword.revokeSessionsOnPasswordReset`.

For local SMTP testing, the Astro example accepts `SMTP_URL` and `EMAIL_FROM` (see `examples/astro/.env.example`). Set `SMTP_URL=smtp://127.0.0.1:1025` for a local email catcher on port 1025. Development permits a catcher without TLS; production requires TLS. Start the example, choose **Forgot password?**, and open the link in the catcher's inbox.

`auth` is [better-auth](https://better-auth.com)'s options object. It is better-auth's API and follows better-auth's versioning.

- Core owns `database`, `basePath` and `secret`. It always turns `emailAndPassword` on, because the admin login needs it; your other email options stay.
- `modelName` is not accepted: core reads the `user` table by name, so auth tables keep their default names.
- Only the first user can sign up without a session (`/auth-status` reports `setup`). After that, any user creation without a signed-in session returns 403, on every endpoint (email sign-up, social sign-in, magic link, other plugins). A signed-in admin can create more users, for example with the `admin()` plugin. Server code that calls better-auth without a request is trusted.
- Tables of plugins are created at runtime on the first database access. There is no CLI step.
- Core's first-user rule runs before your `databaseHooks.user.create.before`.
- The admin supports email/password, passkeys and password reset. Plugins that need other UI (2FA, magic link) work on the server, but not in the admin yet.

Coming from Payload, the auth hooks map to better-auth's request hooks:

| Payload               | better-auth                                                 |
| --------------------- | ----------------------------------------------------------- |
| `beforeLogin`         | `hooks.before` with `ctx.path === '/sign-in/email'`         |
| `afterLogin`          | `hooks.after` with `ctx.path === '/sign-in/email'`          |
| `afterLogout`         | `hooks.after` with `ctx.path === '/sign-out'`               |
| `afterForgotPassword` | `hooks.after` with `ctx.path === '/request-password-reset'` |

```ts
import { createAuthMiddleware } from 'better-auth/api'

auth: {
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-in/email') console.log('signed in')
    }),
  },
}
```

## Customize the admin

Everything the admin needs from the host sits in one `admin` object in `integral.config.ts`: branding, custom fields, pages and the admin bar. Write it inline, or extract it into a module and import it. Browser implementations load through `clientRef()`.

```ts
// admin.ts
import { clientRef, type AdminOptions } from "integral-cms/admin";

export const admin = {
  name: "Acme",
  logo: { light: "/logo-light.svg", dark: "/logo-dark.svg" },
  icon: "/icon.svg",
  media: { nav: { group: "Assets", icon: "images" } },
  fields: {
    color: { mount: clientRef("./src/admin/color.ts#mountColor") },
  },
  pages: {
    home: {
      route: "/",
      nav: { display: "main" },
      mount: clientRef("./src/admin/home.ts#mountHome"),
    },
    stats: {
      title: "Stats",
      nav: { icon: "chart-bar", order: 5 },
      // Runs on the server. The mount gets the result as `ctx.data`.
      load: async ({ cms, user }) => ({
        editor: user.name,
        posts: await cms.find("posts", { limit: 10, populate: false, select: { title: true } }),
      }),
      mount: clientRef("./src/admin/stats.ts#mountStats"),
    },
    report: {
      route: "/reports/:id",
      nav: { display: "none" },
      mount: clientRef("./src/admin/report.ts#mountReport"),
    },
  },
} satisfies AdminOptions;

// integral.config.ts
export default defineCms({ /* … */ admin });
```

`satisfies AdminOptions` is optional: `defineCms` types an inline object too.

**Server and browser.** Only `load` functions run on the server. They get the signed-in user, the user's `cms` and the admin language as `locale`, MUST only read, and MUST return JSON (`null`, booleans, strings, finite numbers, arrays, plain objects); anything else is an error. Everything the browser runs is a `clientRef()` to an export in a module of its own. `clientRef()` names a module and an optional `#export` (default: `default`). Relative paths resolve from the project root, not from the file that calls it. Package paths resolve through package exports. Astro, Nuxt and `integralAdmin()` find the literal `clientRef()` calls in the static imports of `integral.config.ts` without running it, and bundle those exports for the browser only. Computed references are rejected. Inline functions for `mount`, `onClick` or `pageHeader` are rejected too. Keep loader results small and deliberate: being signed in does not make every server value fit for the browser.

**What is public.** Only the login branding (`/admin-brand`). Fields, pages and bar items arrive after sign-in from `/schema` and `/admin-bar`, without loader functions. `POST /api/cms/admin/load` runs one loader for the signed-in user and answers with its data; it only accepts registered keys. Responses are `Cache-Control: no-store`. Loaders read the user's perspective: drafts only with a session and the preview cookie.

**Merging.** Plugin registrations come first, then the host's. A field or page key used twice throws. Host branding wins. Bar items replace earlier items with the same `id`.

**Styles.** The admin runs on a page of its own, so a field or page MAY bring CSS. The bar's graph is different: it loads on site pages after the session check, so its modules MUST NOT inject CSS. Put styled fields and pages behind `clientRef()`, and mount bar CSS inside the shadow root (`?inline`).

Not available yet: switching between Drafts and Published without a reload, and loaders that depend on unsaved form values.

- `fields` registers an input per custom field type. A field with `type: 'custom:color'` uses `fields.color`. Custom types are stored and validated as strings, and fall back to a text input without a registered one. Only built-in types and `custom:` types type-check, so a typo like `'txt'` is an error.
- `pages` adds routes under the admin path. The path is `/<key>` unless `route` is set; routes start with `/`, and nesting and params work, like `route: '/reports/:id'`. A page shown in the content sidebar or on the Settings page opens under `/content` (`/stats` becomes `/content/stats`) or `/content/settings`; `main` and `none` pages use the route as is and open full width, without the sidebar, under the top bar.
- A page has an optional `title` (default: its key), `description` and `nav`. `nav` is the same for collections, globals, pages and media:
  - `display`: `content` (default) shows it in the sidebar, `settings` as a card on the Settings page, `main` in the top bar next to Content and Visual Editor, sorted by `order` (on phones, in the menu sheet), `none` nowhere. A `none` page like `/reports/:id` still works by URL.
  - `group`: the section. The default is `Content` in the sidebar and `Site` on the Settings page, in the admin language.
  - `icon`: a [Lucide](https://lucide.dev/icons) name, type-checked. `order`: lowest first.
- Collections and globals take `description` and `nav` in their own config, next to `label`. Items sort by `order` (collections 10, media 15, globals 20, pages 30; equal orders keep their definition order), and sections appear in the order of their first item. `media` takes `{ label, nav }` to move the media library.
- Settings: the sidebar has a "Settings" entry under "Admin" when any item has `display: "settings"`. It opens `/content/settings`, a page with one section of cards per `group`, and each card opens its global, collection or page. The default `general` and `seo` globals sit there, and so can your own: `defineGlobal({ label: "Footer", nav: { display: "settings", order: 3 }, fields })`.
- `name` shows in the sidebar header, on the login and in the page title (default `integral-cms`). `logo` (sidebar header and login) and `icon` (collapsed sidebar) are URLs, or `{ light, dark }` pairs that follow the admin's theme. The admin links the files and does not bundle them: put them in the host's `public/` folder (`static/` where the framework calls it that) and use the URL, like `/logo.svg`.
- The favicon is `favicon` if set, else `icon`, else the host's `favicon.svg`, `.ico` or `.png` in its public folder. `favicon` takes a URL or a `{ light, dark }` pair.
- `title` is the navigation label, the document title and the default header text. The visible header area above a page is `pageHeader`: `true` (default) shows the title as text, `false` nothing, an array of `{ label, to }` breadcrumbs, and `clientRef()` of a function `(crumbs, { params, query, data, integral })` returns an HTML string or breadcrumbs (`crumbs` are the route's). The function MUST be synchronous. The string is not escaped, so escape untrusted values like `params`, and prefix links with `integral.base`.
- A page on a built-in path replaces that view: `route: '/'` with `display: 'main'` replaces the redirect from `/` to `/content` (the admin has no dashboard of its own), and `route: '/collections/posts'` the posts list. Without one, the admin keeps its default.
- Plugins contribute the same `admin` object through [`definePlugin({ admin })`](#plugins).
- The admin speaks English and German. Each user picks the language under "Interface language" in the user menu; the browser keeps the choice (`integral-admin-locale` in `localStorage`), and without one the admin follows the browser language. It is independent of the content languages in `localization`. Server validation messages stay English.
- Every label and description you write takes a string for every language or one per language: `label: { en: "Posts", de: "Beiträge" }`. That covers collections, globals, fields, blocks, `labels.singular` / `plural`, `nav.group`, page `title` / `description`, bar item labels (also from a loader) and `media.label`. A missing language shows English, then the first entry. The built-in General, SEO, Strings and Media entries ship both.
- Your own browser code gets the language as `ctx.integral.locale` (`"en"` or `"de"`), in pages, fields, page headers and bar items; a switch calls `update(ctx)`. Server `load` functions get it as `locale`. `translator()` from `integral-cms/admin` reads your own message files:

  ```ts
  import { translator } from "integral-cms/admin";
  import en from "./locales/en.json";
  import de from "./locales/de.json";

  export const mountStats: Mount<PageContext> = (el, ctx) => {
    const t = translator({ en, de }, ctx.integral.locale);
    el.textContent = t("stats.count", { n: 3 }); // "{n} quotes" in en.json
    // …
  };
  ```

  Keys are dotted paths, `{name}` fills a parameter, and a missing key falls back to English, then to the key. `translate(text, locale)` resolves one `{ en, de }` value. The bundled redirects and example plugins use both.

Every browser slot (field, page, bar item) is one function, `mount(el, ctx)`, exported from a module and registered with `clientRef()`. It gets an empty element and the context, and returns a cleanup. Return `{ update, unmount }` instead to also receive context changes. For Vue and React there are ready-made wrappers; export their result and reference the export:

```ts
// src/admin/color.ts
import { renderVue } from "integral-cms/admin/vue";
import { renderReact } from "integral-cms/admin/react";
import ColorInput from "./ColorInput.vue";

// A .vue component, gets the context as reactive props
export const mountColor = renderVue(ColorInput);
// A React component, re-rendered on context changes
export const mountColorReact = renderReact(ColorInputReact);
```

They import your `vue` or `react-dom`, so the components run in your app's runtime with HMR. Other frameworks, or no framework, write the function directly:

```ts
// Plain DOM
export const mountColor: Mount<FieldContext> = (el, { value, onChange }) => {
  const input = Object.assign(document.createElement("input"), { type: "color", value });
  input.oninput = () => onChange(input.value);
  el.append(input);
  return () => input.remove();
};

// Svelte 5
export const mountColor: Mount<FieldContext> = (el, ctx) => {
  const app = mount(ColorInput, { target: el, props: ctx });
  return () => unmount(app);
};
```

The admin bundles its own Vue, so hosts install nothing extra and no runtime is shared with it.

Contexts: fields get `{ name, field, value, onChange, data }`. Pages get `{ params, query, data }`: the route params, the query string and what the page's `load` returned. Bar items get the bar context and `data`. All of them also get `integral`: `base` is the admin path to prefix links with, `navigate(path)` opens an admin view without a reload, and `reload()` runs the `load` of that field, page or item again. Plain links under `base` also open in the admin. For writes, use `createClient()` from `integral-cms/client`; the admin's session cookie makes them work.

`data` is `undefined` without a `load`. With one, the first mount waits for the browser code and the data, and shows a loading state in its own area. A failed load shows a local error with a retry; it never shows a server stack. Then:

- A page reloads when its route params or query change. It never shows the previous route's data as current.
- A field loads when it mounts and when its owner changes, for example when a new document gets its id on first save. Typing in the field does not reload it, and `update(ctx)` still gets the new `value`.
- A bar item loads with the bar request, again when the page URL changes and on the existing focus check.
- Responses that arrive after cleanup or after a newer request are dropped. A 401 ends the session as usual.

There are no extra events (`onSave`, subscriptions). `update(ctx)`, the field setter, your framework's watchers and the server hooks cover those cases. Navigating between two URLs of the same page, say `/reports/posts/1` to `/reports/posts/2?tab=body`, calls `update` with the new context instead of remounting. `renderVue` and `renderReact` turn that into prop changes, so watch `params` or put it in an effect's dependencies to refetch. The `example` plugin's `quote` page does this. The admin wraps a field in its label; the input only renders the control, in the admin's light DOM, so the shared `.input` and `.btn` classes apply.

To serve the admin elsewhere, pass a path: `admin: '/cms'` to the Astro integration or the Nuxt module, or `integralAdmin({ path: '/cms' })` with a matching route file (`src/routes/cms.$.ts`). To ship no admin at all, pass `admin: false`. Core never imports the admin, so it only lands in your bundle when you mount it.

## Plugins

Register a plugin once in `integral.config.ts`. It contributes collections, globals, hooks, routes and an `admin` object (fields, pages, bar items), with no second file to wire up. A plugin MAY define no collections or globals at all and only extend the admin.

```ts
// integral.config.ts
import { redirects } from "integral-cms/plugins/redirects";
export default defineCms({ collections: { pages }, plugins: [redirects()] });
```

A plugin is an object from `definePlugin()`:

| Key                | What it adds                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | Unique, lowercase, e.g. `redirects`. Prefix of the plugin's routes                                                                                                                           |
| `collections`      | Collections, typed like the host's: `cms.find('redirects')` works. A name the host or another plugin uses throws at startup                                                                  |
| `globals`          | Globals, the same way. The admin renders them, so a global doubles as the plugin's settings page                                                                                             |
| `hooks`            | Root hooks for every collection and global, run after the collection's own hooks and before the host's root hooks                                                                            |
| `routes`           | `(api) => api.get(…)` on a Hono sub-app at `/api/cms/<name>`, behind CSRF and session checks. `c.var.cms` runs with the session user, `c.var.user` is that user                              |
| `publicRoutes`     | Same, without a session. `c.var.cms` has no user. Meant for reads                                                                                                                            |
| `publicMiddleware` | Hono middleware for every `/api/cms` request, auth included, before any route. `c.var.cms` has no user. Return a response to stop the request (rate limits, logging, headers)                |
| `middleware`       | Hono middleware for requests with a session (writes, `/schema`, plugin `routes`), after CSRF and session checks. `c.var.user` is set                                                         |
| `admin`            | Fields, pages and admin bar `items`, like the host's [`admin`](#customize-the-admin). A plugin sets no bar `position` and never turns the bar off. Merged before the host's, in plugin order |

Route and middleware errors map like core's: `ValidationError` is 400 with field errors, `ConflictError` 409, anything else 500. `admin`, `auth`, `collections`, `globals`, `localization`, `media`, `preview` and `schema` are reserved names.

The redirects plugin registers its tools page this way. Pages call plugin routes with `client.request()`. A plugin that ships browser code MUST keep `clientRef()` calls literal and keep `integral-cms/admin` external, so the adapters can find them.

A plugin does not need a route for everything. What the site needs at a pretty URL is a framework route in the host, calling a helper the plugin exports with the local API. That is how the redirects plugin resolves a path:

```ts
// src/middleware.ts (Astro)
import { resolveRedirect } from "integral-cms/plugins/redirects";
import cms from "../integral.config";

export const onRequest = defineMiddleware(async (context, next) => {
  const redirect = await resolveRedirect(cms, context.url.pathname);
  return redirect ? context.redirect(redirect.to, redirect.status) : next();
});
```

The bundled plugins live in `packages/plugins` and ship inside `integral-cms` as `integral-cms/plugins/<name>`. They import core only through its public exports, the same way a third-party plugin does.

### Publishing a plugin

A plugin on npm is an ordinary package with two halves: the server half (`definePlugin()`) and the browser half (the modules behind its `clientRef()`s). The bundled plugins use a repo-specific build, so start from this instead.

```jsonc
// package.json
{
  "name": "cms-plugin-quotes",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
    "./admin": { "types": "./dist/admin/index.d.mts", "default": "./dist/admin/index.mjs" },
    "./admin/bar": { "types": "./dist/admin/bar.d.mts", "default": "./dist/admin/bar.mjs" },
  },
  "files": ["dist"],
  "peerDependencies": { "integral-cms": "^0.10.0" },
}
```

```ts
// src/index.ts
export const quotes = () =>
  definePlugin({
    name: "quotes",
    admin: {
      pages: {
        stats: { mount: clientRef("cms-plugin-quotes/admin#mountStats") },
      },
      adminBar: {
        items: {
          count: { label: "Quotes", mount: clientRef("cms-plugin-quotes/admin/bar#mountCount") },
        },
      },
    },
  });
```

```ts
// tsdown.config.ts
import { defineConfig } from "tsdown";
import Vue from "unplugin-vue/rolldown"; // only for Vue components

// Bundled into the admin chunks, so the host installs neither Vue nor React.
const bundled = /^(vue|react|react-dom|scheduler)(\/|$)|^@vue\/|^integral-cms\/admin\/(vue|react)$/;

export default defineConfig({
  plugins: [Vue({ isProduction: true })],
  entry: ["src/index.ts", "src/admin/index.ts", "src/admin/bar.ts"],
  platform: "neutral",
  fixedExtension: true,
  // Everything else (`integral-cms`, `hono`, ...) comes from the host.
  external: (id, importer) => !!importer && !id.startsWith(".") && !bundled.test(id),
  // Keeps CSS imports in the output, one file per chunk, so only styled entries load CSS.
  css: { inject: true, splitting: true },
  define: {
    "process.env.NODE_ENV": '"production"',
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
  },
  dts: { vue: true },
});
```

What every published plugin MUST get right:

- **`integral-cms` is a peer dependency and stays external.** Bundling it would give the host two copies of the core and break the `clientRef()` and type matching. `integral-cms/admin` is the only core import the browser code needs.
- **Ship the admin half compiled.** The host's Vite may not compile `.vue`, JSX or TypeScript from `node_modules`. Bundle the framework into the admin chunks (`bundled` above) or write plain DOM. Either way, the host installs no extra package.
- **`clientRef()` takes a package path, and it MUST be a literal string.** `clientRef("cms-plugin-quotes/admin#mountStats")` resolves from the host's project root, so the plugin has to be installed there. The adapters find the call by reading the module graph of the host's `integral.config.ts`, which has to import the plugin statically.
- **Give the admin bar its own entry.** The bar loads on every page of the site, so everything it reaches (`adminBar` items, and every key of an object or map they touch) MUST be free of CSS and of Vue `<style>` blocks. Keep the bar mounts in a separate file such as `admin/bar` and style them inline, because the bar's shadow root gets no page CSS. The adapters reject a plugin that breaks this at startup.
- **Style pages with the plugin's own CSS.** The admin's Tailwind does not scan plugin code; only `.input` and `.btn` are shared. Plugin CSS lands in the admin's page and applies to all of it, so scope every selector: a page class, scoped styles or a Tailwind `prefix()`. An unscoped selector restyles the admin; write one only on purpose. See `packages/plugins/src/example` for a plain `?raw` file, a Vue `<style scoped>` and compiled Tailwind.
- **Build the types.** `definePlugin()` keeps the literal collection and global names, so a host gets `cms.find('quotes')` typed. If the declaration build fails with a missing type, the type is missing from core's public exports.

Before you publish, run `npm pack`, install the tarball in one of the examples and start its dev server once. A wrong `exports` entry, a bundled copy of `integral-cms` or CSS in the bar's graph all show up there.

`example({ admin: '/admin' })` is a starting point to copy, not a feature. It uses every plugin option once: a `quotes` collection with a custom `rating` field, a `quoteSettings` global, a root hook, both middlewares, `GET /api/cms/example/random` (a random quote as text), `GET /api/cms/example/quotes.csv` for admins, a stats page with a `load` and a `pageHeader`, a detail page, and four bar items (a link, a loaded dropdown, a button and a custom control). Its browser code exists in plain DOM, Vue and React; `renderer: 'html' | 'vue' | 'react'` picks one for the field and pages. Vue and React are bundled into its admin chunks, so hosts install neither. Its `admin` option is the admin path, for the bar links.

`redirects({ collections: ['pages'], field: 'path', locales: ['en', 'de'] })` adds the `redirects` collection (`from`, `to`, `permanent`, `locale`; `locales` makes `locale` a dropdown, else it is free text), a hook that creates a redirect when a listed document's path changes and keeps chains one hop long, `GET /api/cms/redirects/lookup?path=` (with `&locale=` for a locale, see [Localization](#localization)) for everyone, `POST /api/cms/redirects/import` (an array of redirects) for admins, and a "Redirect tools" admin page to test paths and import.

## Environment and deployment

- `dev` and `preview` load `.env` in all examples. The examples' `start` scripts pass `--env-file-if-exists=.env` to Node.
- In production, set variables in your host or process manager.
- **Use an absolute database path or a `libsql://` URL in production.** A relative `file:` path resolves against the working directory. For example, `nuxt preview` runs from `.output/`, which every build deletes.
- Build on the same OS and CPU you deploy to. libsql ships a native binary per platform.

## Project layout

```
packages/core    integral-cms: schema, Hono app, local API, HTTP client, auth, presets, Astro integration, Nuxt module, Vite plugin
packages/admin   Vue 3 + Tailwind admin, built as a library into core's dist/admin (private)
examples/astro   Astro 7 app, mixing prerendered pages and SSR pages, on @astrojs/node
examples/nuxt    Nuxt 4 app
examples/tanstack-start  TanStack Start (React) app on Nitro v3
examples/standalone      Headless CMS without a site: API and admin on Vite + Nitro v3
```

## Scripts

| Command                                                           | What it does                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev:astro` / `dev:nuxt` / `dev:tanstack` / `dev:standalone` | Build packages, start the example and the admin playground on `:5173/admin/` |
| `pnpm --filter @integral-cms/admin watch`                         | Rebuild the admin into the example on change                                 |
| `pnpm build`                                                      | Build packages and all examples                                              |
| `pnpm typecheck`                                                  | Build packages, then type-check everything                                   |

## Status

Working:

- Schema-in-code collections and globals with inferred types
- Relations between collections: `relation` and `join` fields, typed `populate`, `onDelete` rules
- Admin in English and German: list, create, edit, delete; globals; email/password login; custom fields, pages and admin bar items via `admin` in `integral.config.ts` (`mount(el, ctx)` from any framework, optional server `load`)
- Public read API with equality filters, `limit` and `select`; `Astro.locals.integral` in Astro, `useIntegral()` in Nuxt
- Collection, global and field hooks, run by the local API in one transaction per write
- Validation in the local API (zod) with field errors in the admin, CSRF protection, first-user-only sign-up
- Field options: help text, placeholders, defaults, built-in checks, `validate`, conditions, `unique`, `private` and `readOnly`
- `slug` fields, and the page and SEO preset (`integral-cms/presets`): nested paths, SEO fields, and `seoMeta()` / `breadcrumbs()` / `slugify()`
- Content localization: per-collection `localized`, per-locale drafts and publishing, fallback, `permalink`, `hreflang`, a language menu in the admin, translatable site strings (see [Localization](#localization))
- Media library: chunked uploads to the local disk or S3/R2, folders, `image` and `file` fields, responsive images through IPX or Cloudflare, media hooks
- Plugins with collections, globals, root hooks, routes and admin registrations (fields, pages, bar items); `integral-cms/plugins/redirects`, and `integral-cms/plugins/example` to copy from
- Astro integration, Nuxt module, TanStack Start via `integralAdmin()`; dev, preview and production on Node
- SQLite via libsql (local file or Turso), Kysely
- better-auth options pass through (`auth`): plugins, hooks, sessions
- Server-side email with an SMTP adapter, replaceable authentication templates and custom adapters

Roadmap, roughly in order:

1. Live preview: `permalink` / `preview` per collection, iframe in the editor (in progress: core done, see [Live preview](#live-preview))
2. Drafts and published versions
3. ~~Media uploads with a storage adapter (local disk, S3/R2)~~ Done, see [Media](#media)
4. Rich text (format still open: Tiptap JSON or Markdown)
5. Invites, roles and access control
6. Cloudflare Workers: D1 driver, per-request bindings
7. Postgres
8. SvelteKit adapter
9. Publish to npm

Build later, small and in no order:

- A document type export, e.g. `DocOf<typeof cms, 'posts'>`: a post as a read returns it, without `Awaited<ReturnType<…>>`

## Prior art

- [Pruvious](https://pruvious.com): the Nuxt-integrated CMS this idea comes from
- [Payload 3](https://payloadcms.com): schema in code, embedded in Next.js, Drizzle adapters
- [SonicJS](https://sonicjs.com): Hono + D1 + Drizzle, one JSON documents table
- [Keystatic](https://keystatic.com): clean Astro integration, files in git
- [Sveltia CMS](https://github.com/sveltia/sveltia-cms): git-based; its field widgets are worth a look
