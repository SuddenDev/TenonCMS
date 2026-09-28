# Select and breadcrumbs

Spec 7. Requires spec 2 (relations), spec 3 (hooks), spec 5 (page preset) and spec 6 (field options).

## Goal

Reads return whole documents today. `populate` only decides which relations are resolved; every other field always comes back. Pages that need a few fields, like breadcrumbs or a list of links, send far more than they use over HTTP and into client components.

`select` is a whitelist of the fields a read returns. `populate` keeps its one job. `breadcrumbs()` builds a breadcrumb trail from a page read with `select`, and the Astro example shows it.

## Usage

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

breadcrumbs(page);
// [{ title: 'About', path: '/about' }, { title: 'Team', path: '/about/team' }, { title: 'Person', path: '/about/team/person' }]
```

HTTP and the client:

```
GET /api/cms/collections/pages?path=/about/team&populate=parent&select=title,path,parent.title,parent.path
```

```ts
await client.findOne("pages", {
  where: { path },
  populate: { parent: true },
  select: { title: true, parent: { title: true } },
});
```

## `select`

- Accepted by `find`, `findOne`, `findById` and `getGlobal`: in the local API, in the client, over HTTP (`?select=`) and in the Nuxt `useIntegral()` composable. Not accepted by writes.
- Without `select`, reads return what they return today.
- `select` and `populate` are independent. `populate` decides what is resolved. `select` decides what comes back.

Rules:

| In `select`                  | Result                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| a field `: true`             | the field's value                                                                                                  |
| a group `: true`             | the whole group                                                                                                    |
| a group `: { … }`            | only the listed children, by these same rules                                                                      |
| a relation or join `: true`  | the value as `populate` leaves it: an id, ids, a document or documents                                             |
| a relation or join `: { … }` | the resolved document, or each item of a `many` relation or join, with only the listed fields, by these same rules |
| a field not listed           | left out                                                                                                           |

- `id` is always returned, at every level with documents. `createdAt` and `updatedAt` are returned only when listed.
- A join still comes back only when `populate` names it, as today.
- `private` fields without a session are left out, as today. Selecting one is not an error.

Errors:

- A key that is not a field of the collection, global or group (at that level): type error in the local API and the client, 400 over HTTP (`Invalid select`).
- `: { … }` on a relation or join that `populate` does not resolve at that level: type error, 400 over HTTP. Checked against the read's populate spec: a populate object, `true`, or `depth`.
- `: { … }` on a field that is neither a group, a relation nor a join: type error, 400.
- `select: {}` returns only `id`.

Order in a read: load rows → `beforeRead` → `populate` (with the target collections' read hooks) → field and collection `afterRead` → `select` → `afterOperation`. Hooks before `select` see full documents. `afterOperation` sees exactly what the read returns.

The database still loads whole rows. A document is one JSON value in one row, and `populate` and `afterRead` need the full document. `select` limits what leaves the read: the response, the data handed to client components, the data that reaches the browser.

### HTTP

- `?select=` is a comma-separated list of dot paths: `?select=title,path,parent.title,parent.path`.
- A path that ends at a group, relation or join means `: true`. `seo` and `seo.title` together mean `seo: { title: true }`: the longer path wins.
- `select` is a reserved query param, like `limit`, `populate` and `depth`. A field named `select` cannot be filtered over HTTP.
- The client builds `?select=` from the object, as it does for `populate`.

### Types

- The result of a read with `select` contains `id` plus the selected fields, with their resolved types (relations as `populate` resolves them).
- Without `select`, the read types do not change.
- The client, `useIntegral()` and the local API share the types, as they do for `populate`. Untyped schemas (the admin's) accept any `select` and return plain records.

## `breadcrumbs()`

A helper in `src/helpers/breadcrumbs.ts`, exported from `integral-cms` and `integral-cms/client`. No imports, so it runs in the browser.

```ts
breadcrumbs(doc, { title: "title", path: "path", parent: "parent" });
// → { title: string; path: string }[]
```

- Walks the resolved `parent` chain of `doc` and returns one entry per document, from the root down to `doc` itself.
- The walk stops at a `parent` that is not an object: `null`, missing, or an id that was not resolved. The trail then starts at the last resolved ancestor. It makes no queries; the read MUST resolve as many levels as the tree has.
- Options name the fields and default to the names in `page.fields`. Each option has JSDoc.
- `title` falls back to `''` when missing, `path` to `''`.

## Astro example

`examples/astro/src/pages/[...path].astro` reads the page with `populate` and `select` for three levels and renders the trail above the title:

```astro
<nav aria-label="Breadcrumb">
  <ol>
    {trail.map((crumb, i) => (
      <li>{i === trail.length - 1 ? <span aria-current="page">{crumb.title}</span> : <a href={crumb.path}>{crumb.title}</a>}</li>
    ))}
  </ol>
</nav>
```

The page body and SEO fields are selected too, so the route still renders them. A root page shows a trail of one entry.

## Docs

- README: `select` under "Read content", with the rules table, the HTTP syntax and one example. `breadcrumbs()` under "Pages and SEO", with the Astro example.
- CLAUDE.md: where `select` runs in `read()`, the HTTP parsing, and the helper.
- JSDoc on `select` in `ReadOptions` and the client's options, and on every `breadcrumbs()` option.

## Testing

Unit (`schema.test.ts`, `helpers/breadcrumbs.test.ts`):

- the pick function: fields, whole group, partial group, relation `true`, relation object, `many` relation, join, `id` always, `createdAt` only when listed
- `breadcrumbs()`: three levels, a root page, a chain cut at an unresolved id, custom field names
- types: selected fields only, `doc.body` a type error when not selected, `select` into an unresolved relation a type error, unknown key a type error (`@ts-expect-error`)

Integration (`app.test.ts`):

- local API and HTTP return only the selected fields, for `find`, `findOne`, `findById` and `getGlobal`
- `?select=` parsing: dot paths, longer path wins, reserved param
- 400 for an unknown key, for selecting into an unresolved relation, and for `: { … }` on a plain field
- private fields are left out without a session and returned with one
- `afterRead` hooks see the full document; `afterOperation` sees the selected one
- a join with `select` inside it

Examples: the Astro smoke test shows the breadcrumb trail on `/company/our-team`.

## Out of scope

- `select` on write responses
- `defaultPopulate` per collection
- selecting fields in SQL
- a helper that builds the nested `populate` and `select` objects for N levels
