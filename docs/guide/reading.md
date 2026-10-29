# Reading and writing content

The local API reads and writes content from server code. The same calls exist over HTTP and in the browser client. Everything is typed from your schema: unknown collections or fields are type errors.

## Read

```ts
await cms.find("posts"); // all, newest first
await cms.find("posts", { where: { category: "news" } }); // equality filters
await cms.find("posts", { limit: 5 }); // the 5 newest
await cms.findOne("posts", { where: { slug: "hello" } });
await cms.findById("posts", id);
await cms.getGlobal("general"); // a default settings global, see Pages and SEO
```

## Pick fields with `select`

Reads return whole documents unless `select` lists the fields you need. `populate` decides which relations are resolved. `select` decides what comes back:

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

- `find`, `findOne`, `findById` and `getGlobal` accept `select`, in the local API, the client and `useTenon()`. Writes do not.
- `id` always comes back, at every level that holds documents. `createdAt` and `updatedAt` come back only when listed. `select: {}` returns only `id`.
- A join still comes back only when `populate` names it. `private` fields stay hidden without a session; selecting one is not an error.
- Hooks see full documents. `select` runs after `afterRead` and before `afterOperation`.
- Result types contain only the selected fields. An unknown key is a type error, and a 400 over HTTP (`Invalid select: parent.nope`).

Relations are explained in [Relations](./relations.md).

## Update

`update` and `setGlobal` change only the top-level fields they receive. The others keep their stored values. `null` clears a field. A group you send replaces the stored group. This holds for the local API, HTTP `PUT` and the client.

```ts
await cms.update("posts", id, { views: 5 }); // title, body and the rest stay
```

## Over HTTP

Reads work over HTTP without a session, because the site renders that content anyway. Writes and the schema endpoint need a session.

```text
GET /_tenon/collections/posts?slug=hello&limit=1
GET /_tenon/globals/general
```

- Query params are equality filters, and `limit` caps the result.
- `?category=null` matches an empty or missing field, like `null` in `where`. An empty value (`?category=`) adds no filter.
- `populate`, `depth`, `select` and `limit` are reserved, so a field with one of those names cannot be filtered over HTTP.
- `?select=` is a comma-separated list of dot paths: `?populate=parent&select=title,path,parent.title,parent.path`. A path that ends at a group, relation or join means `true`. `seo` and `seo.title` together mean `seo: { title: true }` (the longer path wins).
- An empty object inside `select` or `populate` ends a path. So `select: { parent: {} }` gives `{ id }` in the local API but the whole `parent` over HTTP.

## Browser client

In the browser (admin pages, islands, client components), `tenoncms/client` gives the same methods over HTTP, typed from your schema:

```ts
import { createClient } from "tenoncms/client";

const client = createClient();
await client.find("posts", { where: { featured: true } });
await client.findOne("pages", {
  where: { path },
  populate: { parent: true },
  select: { title: true, parent: { title: true } },
});
await client.update("posts", id, post); // needs a session, so it works in admin pages
await client.getSession(); // the signed-in admin, or null
await client.request("/redirects/lookup", { query: { path } }); // any route under /_tenon, e.g. a plugin's
```

To type your own browser code, `Collections<C>` and `Globals<C>` give the schema as HTTP sends it, with `private` fields optional:

```ts
import type { Collections } from "tenoncms/client";
import type cms from "../tenon.config";

type PostFields = Collections<typeof cms>["posts"]["fields"];
```

The Astro and Nuxt adapters register your `cms` type, so `createClient()` needs no type argument. Without an adapter, add this to `tsconfig.json`:

```jsonc
"compilerOptions": {
  "types": ["tenoncms/register"],
  "paths": { "#tenon/config": ["./tenon.config.ts"] }
}
```

`createClient<typeof otherCms>()` overrides the registered type.
