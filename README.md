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
  globals: { site: { fields: { title: { type: "text", required: true } } } },
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

Field types: `text`, `textarea`, `number`, `boolean`, `date`, `select`, `slug`, `group`, `relation`, `join` (see [Relations](#relations)). `defineGlobal()` does the same for globals.

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

| Option                              | Types                                                                               | What it does                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `label`                             | all                                                                                 | Label in the admin                                          |
| `description`                       | all                                                                                 | Help text below the field in the admin                      |
| `placeholder`                       | `text`, `textarea`, `number`, `date`                                                | Shown in the empty input                                    |
| `required`                          | all but `join`                                                                      | The value MUST be present                                   |
| `default`                           | all but `join`                                                                      | Value on `create` when the field is `undefined`             |
| `minLength`, `maxLength`, `pattern` | `text`, `textarea`                                                                  | String length, and a regular expression for the whole value |
| `min`, `max`                        | `number`                                                                            | Number range                                                |
| `validate`                          | all but `join`                                                                      | Your check, on the server                                   |
| `condition`                         | all                                                                                 | The field applies only when this matches                    |
| `unique`                            | top-level `text`, `textarea`, `number`, `date`, `select`, `slug`, single `relation` | No two documents MAY have the same value                    |
| `private`                           | all                                                                                 | Keep values out of public HTTP reads                        |
| `readOnly`                          | all but `join`                                                                      | The admin shows the input disabled                          |
| `hooks`                             | all but `join`                                                                      | See [Hooks](#hooks)                                         |

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
- A key without `/` is a sibling field: a field of the document at the top level, a field of the same group inside a group. A leading `/` starts at the document root; dots walk into groups.
- The admin hides fields whose condition is false and saves them as `null`. Values survive toggling until you save.
- The server skips `required`, the built-in checks and `validate` for them, but still checks the type. It never changes or clears values. Reads ignore conditions.
- `defineCms` throws for a condition on an unknown field.

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
await cms.getGlobal("site");
```

Everything is typed from the schema. Unknown collections or fields are type errors.

Reads are also available over HTTP without a session, because the site renders that content anyway.
Query params are equality filters, and `limit` caps the result: `GET /api/cms/collections/posts?slug=hello&limit=1`, `GET /api/cms/globals/site`. `?category=null` matches an empty or missing field, like `null` in `where`; an empty value (`?category=`) adds no filter.
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

| Field      | Options                                                                                       | Where                                                                         |
| ---------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `relation` | `collection` (target), `many`, `onDelete`, `label`, `required`                                | top level and in groups, in collections and globals; targets collections only |
| `join`     | `collection` (source), `on` (path to a relation there, e.g. `author` or `seo.image`), `label` | top level of collections only; not stored                                     |

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

`seo.fields` is one optional group `seo` with `title`, `description` and `noindex`.

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
const { noindex, ...seoRest } = seo.fields.seo.fields
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

const doc = await cms.findOne("pages", { where: { path: "/about/team" } });
const { title, description, noindex } = seoMeta(doc);
// HTTP: GET /api/cms/collections/pages?path=/about/team
```

- `title` is `seo.title`, or the page's `title` when it is empty. Nothing is stored, so the fallback follows title changes.
- `description` is `seo.description` or `undefined`. `noindex` is `true` only when `seo.noindex` is.
- `seoMeta()`, `breadcrumbs()`, `slugify()` and `SLUG_PATTERN` come from `integral-cms`. In browser code, import them from `integral-cms/client`, which pulls no server code.

`breadcrumbs()` builds the trail from a page read with its parents resolved. Read only what the trail needs with [`select`](#2-read-content):

```astro
---
import { breadcrumbs } from 'integral-cms'

const page = await Astro.locals.integral.findOne('pages', {
  where: { path },
  populate: { parent: { parent: true } },
  select: { title: true, path: true, parent: { title: true, path: true, parent: { title: true, path: true } } },
})
const trail = breadcrumbs(page) // [{ title: 'About', path: '/about' }, …, { title: 'Person', path: '/about/team/person' }]
---

<nav aria-label="Breadcrumb">
  <ol>
    {trail.map((crumb, i) => (
      <li>{i === trail.length - 1 ? <span aria-current="page">{crumb.title}</span> : <a href={crumb.path}>{crumb.title}</a>}</li>
    ))}
  </ol>
</nav>
```

- One entry per document from the root down to the page itself. A root page has one entry.
- The walk stops at a `parent` that is not a document: `null`, missing, or an id `populate` did not resolve. It makes no queries, so resolve as many levels as your tree has; the trail then starts at the last resolved ancestor.
- Options name the fields: `breadcrumbs(doc, { title: 'name', path: 'url', parent: 'up' })`. They default to `title`, `path` and `parent`, the names in `page.fields`. A missing title or path reads as `''`.

Each example has a catch-all route that reads by `path`. Static routes win over it, so a CMS page at `/` (or `/about` in Astro) never shows:

- Astro: `src/pages/[...path].astro` with `Astro.locals.integral.findOne`, `select` and breadcrumbs
- Nuxt: `app/pages/[...path].vue` with `useIntegral().findOne` and `useSeoMeta`
- TanStack Start: `src/routes/$.tsx` with a server function and `head`

### Astro

```ts
// astro.config.ts: needs an SSR adapter, e.g. @astrojs/node
import integralCms from "integral-cms/astro";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  integrations: [integralCms()], // reads ./integral.config.ts, options: { entry, admin }
});
```

The integration adds a middleware that exposes the instance as `Astro.locals.integral`, fully typed.

```astro
---
export const prerender = false
const posts = await Astro.locals.integral.find('posts')
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

```vue
<script setup lang="ts">
const { data: posts } = await useIntegral().find("posts");
const { data: post } = await useIntegral().findOne("posts", { where: { slug: "hello" } });
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
import { mountAdmin } from "integral-cms/admin";

mountAdmin("#admin");
```

## Auth

`auth` is [better-auth](https://better-auth.com)'s options object. It is better-auth's API and follows better-auth's versioning.

- Core owns `database`, `basePath` and `secret`. It always turns `emailAndPassword` on, because the admin login needs it; your other email options stay.
- `modelName` is not accepted: core reads the `user` table by name, so auth tables keep their default names.
- Only the first user can sign up without a session. After that, any user creation without a signed-in session returns 403, on every endpoint (email sign-up, social sign-in, magic link, other plugins). A signed-in admin can create more users, for example with the `admin()` plugin. Server code that calls better-auth without a request is trusted.
- Tables of plugins are created at runtime on the first database access. There is no CLI step.
- Core's first-user rule runs before your `databaseHooks.user.create.before`.
- The admin login supports email and password only. Plugins that need UI (2FA, passkey, magic link) work on the server, but not in the admin yet.

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

Create `integral.admin.ts` next to `integral.config.ts`. Astro, Nuxt and `integralAdmin()` pick it up at startup; delete it to go back to the default. Restart the dev server after adding or removing it.

```ts
// integral.admin.ts
import { defineAdmin } from "integral-cms/admin";
import { redirectsAdmin } from "integral-cms/plugins/redirects/admin";

export default defineAdmin({
  fields: { color: mountColorInput },
  pages: {
    home: { route: "/", mount: mountHome },
    stats: { menu: { label: "Stats", icon: "chart-bar", order: 5 }, mount: mountStats },
  },
  plugins: [redirectsAdmin()],
});
```

- `fields` registers an input per custom field type. A field with `type: 'custom:color'` uses `fields.color`. Custom types are stored and validated as strings, and fall back to a text input without a registered one. Only built-in types and `custom:` types type-check, so a typo like `'txt'` is an error.
- `pages` adds routes under the admin path. The path is `/<key>` unless `route` is set; routes start with `/`, and nesting and params work, like `route: '/reports/:id'`.
- `menu` puts a page in the sidebar: `label`, an optional `icon` ([Lucide](https://lucide.dev/icons) name) and `order`. The sidebar is one list sorted by `order`: collections sit at 10, globals at 20, pages default to 30. Equal orders keep their definition order. Pages without `menu` are reachable by URL only.
- A page on a built-in path replaces that view: `route: '/'` replaces the start page, `route: '/collections/posts'` the posts list. Without one, the admin keeps its default.
- `plugins` takes the admin halves of [plugins](#plugins). Their fields and pages merge in before yours; a key used twice throws when the admin mounts.

Every slot is one function, `mount(el, ctx)`, so any framework can plug in. It gets an empty element and the context, and returns a cleanup. Return `{ update, unmount }` instead to also receive context changes. For Vue and React there are ready-made wrappers:

```ts
import { renderVue } from "integral-cms/admin/vue";
import { renderReact } from "integral-cms/admin/react";

fields: {
  color: renderVue(ColorInput);
} // a .vue component, gets the context as reactive props
fields: {
  color: renderReact(ColorInput);
} // a React component, re-rendered on context changes
```

They import your `vue` or `react-dom`, so the components run in your app's runtime with HMR. Other frameworks, or no framework, write the function directly:

```ts
// Plain DOM
color(el, { value, onChange }) {
  const input = Object.assign(document.createElement('input'), { type: 'color', value })
  input.oninput = () => onChange(input.value)
  el.append(input)
  return () => input.remove()
}

// Svelte 5
color: (el, ctx) => {
  const app = mount(ColorInput, { target: el, props: ctx })
  return () => unmount(app)
}
```

The admin bundles its own Vue, so hosts install nothing extra and no runtime is shared with it.

Contexts: fields get `{ name, field, value, onChange }`. Pages get `{ params, query }`: the route params and the query string. Both also get `integral`: `base` is the admin path to prefix links with, and `navigate(path)` opens an admin view without a reload. Plain links under `base` also open in the admin. For content, use `createClient()` from `integral-cms/client`; the admin's session cookie makes writes work. Navigating between two URLs of the same page, say `/reports/posts/1` to `/reports/posts/2?tab=body`, calls `update` with the new context instead of remounting. `renderVue` and `renderReact` turn that into prop changes, so watch `params` or put it in an effect's dependencies to refetch. All three examples have a `post` page that does this. The admin wraps a field in its label; the input only renders the control, in the admin's light DOM, so the shared `.input` and `.btn` classes apply.

To serve the admin elsewhere, pass a path: `admin: '/cms'` to the Astro integration or the Nuxt module, or `integralAdmin({ path: '/cms' })` with a matching route file (`src/routes/cms.$.ts`). To ship no admin at all, pass `admin: false`. Core never imports the admin, so it only lands in your bundle when you mount it.

## Plugins

A plugin is a package with two halves. The server half goes into `integral.config.ts`, the admin half into `integral.admin.ts`. Both are plain objects, so a host can also spread their parts by hand to rename or leave out something.

```ts
// integral.config.ts
import { redirects } from "integral-cms/plugins/redirects";
export default defineCms({ collections: { pages }, plugins: [redirects()] });

// integral.admin.ts
import { redirectsAdmin } from "integral-cms/plugins/redirects/admin";
export default defineAdmin({ plugins: [redirectsAdmin()] });
```

The server half, from `definePlugin()`:

| Key                | What it adds                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | Unique, lowercase, e.g. `redirects`. Prefix of the plugin's routes                                                                                                            |
| `collections`      | Collections, typed like the host's: `cms.find('redirects')` works. A name the host or another plugin uses throws at startup                                                   |
| `globals`          | Globals, the same way. The admin renders them, so a global doubles as the plugin's settings page                                                                              |
| `hooks`            | Root hooks for every collection and global, run after the collection's own hooks and before the host's root hooks                                                             |
| `routes`           | `(api) => api.get(…)` on a Hono sub-app at `/api/cms/<name>`, behind CSRF and session checks. `c.var.cms` runs with the session user, `c.var.user` is that user               |
| `publicRoutes`     | Same, without a session. `c.var.cms` has no user. Meant for reads                                                                                                             |
| `publicMiddleware` | Hono middleware for every `/api/cms` request, auth included, before any route. `c.var.cms` has no user. Return a response to stop the request (rate limits, logging, headers) |
| `middleware`       | Hono middleware for requests with a session (writes, `/schema`, plugin `routes`), after CSRF and session checks. `c.var.user` is set                                          |

Route and middleware errors map like core's: `ValidationError` is 400 with field errors, `ConflictError` 409, anything else 500. `auth`, `collections`, `globals` and `schema` are reserved names.

The admin half, from `defineAdminPlugin()`, has `name`, `fields` and `pages`, exactly as `integral.admin.ts` does. Pages call plugin routes with `client.request()`.

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

`redirects({ collections: ['pages'], field: 'path' })` adds the `redirects` collection (`from`, `to`, `permanent`), a hook that creates a redirect when a listed document's path changes and keeps chains one hop long, `GET /api/cms/redirects/lookup?path=` for everyone, `POST /api/cms/redirects/import` (an array of redirects) for admins, and a "Redirect tools" admin page to test paths and import.

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
- Admin: list, create, edit, delete; globals; email/password login; custom fields and pages via `integral.admin.ts` (`mount(el, ctx)` from any framework)
- Public read API with equality filters, `limit` and `select`; `Astro.locals.integral` in Astro, `useIntegral()` in Nuxt
- Collection, global and field hooks, run by the local API in one transaction per write
- Validation in the local API (zod) with field errors in the admin, CSRF protection, first-user-only sign-up
- Field options: help text, placeholders, defaults, built-in checks, `validate`, conditions, `unique`, `private` and `readOnly`
- `slug` fields, and the page and SEO preset (`integral-cms/presets`): nested paths, SEO fields, and `seoMeta()` / `breadcrumbs()` / `slugify()`
- Plugins with a server half (collections, globals, root hooks, routes) and an admin half (fields, pages); `integral-cms/plugins/redirects` as the first one
- Astro integration, Nuxt module, TanStack Start via `integralAdmin()`; dev, preview and production on Node
- SQLite via libsql (local file or Turso), Kysely
- better-auth options pass through (`auth`): plugins, hooks, sessions

Roadmap, roughly in order:

1. Live preview: `preview: (doc) => url` per collection, iframe in the editor, draft cookie
2. Drafts and published versions
3. Media uploads with a storage adapter (local disk, S3/R2)
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
