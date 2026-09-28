# Page and SEO preset

Spec 5 of 6: group field, relation field, hooks, auth, page preset, field options. Execution order: 4, 1, 2, 3, 6, 5. Requires specs 1–3 and 6.

## Goal

Most websites need pages with nested URLs and SEO fields. The preset gives hosts a working start without hiding anything: it is plain field objects, named hook records and one helper, spread into the host's own collection file. Hosts omit, override and add fields and hooks with plain JavaScript. Starter templates and a CLI come later and are out of scope.

## Usage

```ts
import { defineCollection } from "integral-cms";
import { page, seo } from "integral-cms/presets";

export const pages = defineCollection({
  label: "Pages",
  titleField: "title",
  fields: { ...page.fields, ...seo.fields, body: { type: "textarea" } },
  hooks: {
    beforeValidate: page.hooks.beforeValidate,
    beforeChange: page.hooks.beforeChange,
    afterChange: page.hooks.afterChange,
  },
});
```

Customizing:

```ts
const { noindex, ...seoRest } = seo.fields.seo.fields
const { slugFromTitle, ...beforeValidate } = page.hooks.beforeValidate

fields: {
  ...page.fields,
  seo: { ...seo.fields.seo, fields: { ...seoRest, keywords: { type: 'text' } } },
}
```

A catch-all route reads a page by its stored path and builds `<head>` with `seoMeta()`:

```ts
import { seoMeta } from "integral-cms/presets";

const doc = await cms.findOne("pages", { where: { path: "/about/team" } });
const { title, description, noindex } = seoMeta(doc);
// HTTP: GET /api/cms/collections/pages?path=/about/team
```

No `findByPath` helper: `path` is a stored field, so existing filters cover it.

## Package

- New subpath export `integral-cms/presets` (`src/presets.ts`, tsdown entry). Exports `page`, `seo`, `treeHooks`, `seoMeta`.
- One file. The preset source MUST stay short enough to read in one screen, because it is the documentation of what a host gets.

## Core addition: `readOnly`

An admin-only field option.

- `Base` gets `readOnly?: boolean`. It is allowed on every field type, at any depth, including inside groups.
- The admin shows the field disabled. Nothing else changes: the local API, HTTP and hooks can write it. Input is not stripped, and input types do not change.
- A hook that owns a value MUST overwrite it. The `path` hook sets `path` in `beforeChange`, whatever the input holds.

## Core addition: `slug` field type

```ts
slug: { type: 'slug', from: 'title', parent: 'parent', path: 'path' }
```

- Shape: `{ type: 'slug', from?: string, parent?: string, path?: string }` plus the `Base` options except `required`. `from` names a sibling field to fill the slug from. `parent` names a sibling `relation` field. `path` names the field on the parent document whose value the admin shows as the prefix; it defaults to `'path'`.
- Stored as a string. Always required; there is no `required` option. In `Data` and `Doc` the key is a required `string`.
- The pattern `^[a-z0-9]+(-[a-z0-9]+)*$` is built in. zod checks it on the server; the admin sets it as the input's `pattern` attribute.
- `unique` (spec 6) is allowed on a top-level `slug`. Spec 6 runs first and cannot know the type, so this spec adds `slug` to spec 6's list of `unique` types. Flat collections such as blog posts use `{ type: 'slug', from: 'title', unique: true }`. Trees use the `uniquePath` hook instead, because the same slug may repeat under different parents.
- One shared `slugify()` turns text into a slug: lowercase ASCII, non-alphanumerics to `-`, trimmed. It lives in its own import-free file (`src/slugify.ts`), like `matchCondition` in spec 6. The admin imports it by relative path; the preset hook imports it on the server.

Admin:

- On a new document, the slug fills live from the `from` field while the editor types, until the editor edits the slug. After that it stays.
- On an existing document, changing the `from` field does not change the slug. URLs stay stable.
- If `parent` names a relation field, the input shows the value of the selected parent's `path` field (the field named by the `path` option) as a prefix, e.g. `/about/` [team]. The prefix updates when the parent changes. Without a parent, the prefix is `/`. The editor types only the last segment.

Server:

- The `slug` type fills nothing on its own. The preset hook `slugFromTitle` fills an empty slug for API and script writes (see `page.hooks`).

## `page.fields`

| Field    | Definition                                                        |
| -------- | ----------------------------------------------------------------- |
| `title`  | `{ type: 'text', required: true }`                                |
| `slug`   | `{ type: 'slug', from: 'title', parent: 'parent', path: 'path' }` |
| `parent` | `{ type: 'relation', collection: 'pages', onDelete: 'restrict' }` |
| `path`   | `{ type: 'text', readOnly: true }`                                |

- `onDelete: 'restrict'`: deleting a page with children returns 409 and lists them. No subtree is lost, no URL changes silently.
- A collection with another name overrides one line: `parent: { ...page.fields.parent, collection: 'docs' }`. The hooks read the collection name from their arguments.

## Paths

- A root page with slug `index` has path `/`.
- Any other root page: `/<slug>`.
- A child: `<parent path>/<slug>`, where a parent path of `/` adds no extra slash (`/child`).
- Paths are stored. Reads never compute them.

## `page.hooks`

Named records, built by `treeHooks()` with the default field names.

| Stage            | Name              | Does                                                                                                                                   |
| ---------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `beforeValidate` | `slugFromTitle`   | Fills an empty `slug` from `title` with `slugify()`. It runs before `required` is checked, so API and script writes MAY omit the slug. |
| `beforeChange`   | `noCycle`         | `ValidationError` on `parent` if the parent is the document itself or one of its descendants.                                          |
| `beforeChange`   | `path`            | Computes `path` from the parent's stored path and the slug. It overwrites any `path` in the input.                                     |
| `beforeChange`   | `uniquePath`      | `ValidationError` on `slug` if another document in the collection has the same path.                                                   |
| `afterChange`    | `descendantPaths` | If `path` changed, calls `cms.update` on each direct child. Each child's own hooks recompute its path and recurse to its children.     |

All run inside the write transaction (spec 3), so two parallel saves cannot claim the same path.

### `treeHooks(options?)`

```ts
treeHooks({ title: "name", parent: "parentCategory", slug: "handle", path: "url" });
```

Returns the same records for other field names. Every option defaults to the name used in `page.fields`. `title` is the field `slugFromTitle` reads. The slug field MUST name the same path field, so the admin prefix reads it: with `treeHooks({ path: 'url' })`, the slug is `{ type: 'slug', from: 'name', parent: 'parentCategory', path: 'url' }`. For trees without URLs, a host omits `path` and `uniquePath` and keeps `noCycle`.

## `seo.fields`

```ts
seo: {
  type: 'group',
  label: 'SEO',
  fields: {
    title: { type: 'text' },
    description: { type: 'textarea' },
    noindex: { type: 'boolean', label: 'Hide from search engines' },
  },
}
```

`image` is added when media exists (roadmap #3).

## `seoMeta(doc)`

A pure helper. It has no hooks and stores nothing.

```ts
seoMeta(doc); // { title, description, noindex }
```

- `title`: `doc.seo.title`, or `doc.title` when it is empty. So the fallback follows title changes.
- `description`: `doc.seo.description`, or `undefined`. It has no fallback; the preset cannot know which field holds body text.
- `noindex`: `true` only when `doc.seo.noindex` is `true`.
- Works with a missing or `null` `seo` group.

## Amendment to spec 3

`onDelete` effects (`set-null`, `cascade`) MUST run through the normal `update` and `delete` operations, with their hooks, in the same transaction. Otherwise a `set-null` on a tree parent leaves stale paths. Spec 3 is updated with this rule.

## Examples

The Astro example gets a `pages` collection built from the preset and a catch-all route `[...path].astro` reading by `path`, with `seoMeta(page)` in `<head>`. Nuxt and TanStack Start follow in the same change, each with its catch-all route.

## Out of scope

- Starter templates and a CLI
- Drafts and publish state (roadmap #2)
- Blocks and layouts
- Sharing image (needs media)
- Redirects on path change
- Localized paths

## Tests (TDD: write each test, run it RED, then make it GREEN)

Unit:

- `slugify.test.ts`: umlauts, spaces, punctuation, leading and trailing dashes
- `presets.test.ts`: `slugFromTitle` fills an empty slug and keeps a given one; path rules (`index` at root is `/`, child of `/` is `/child`, nested child); `seoMeta` falls back to `title`, keeps a custom title, handles a `null` group

`schema.test.ts`:

- `slug`: missing, `null`, `''` and values that break the pattern fail; valid slugs pass
- `slug` fields type as a required `string` in `Data` and `Doc`
- `defineCms` accepts `unique: true` on a top-level `slug`
- `readOnly` is accepted at any depth and does not change the input type

`app.test.ts` with a `pages` collection from the preset:

- create root, child and grandchild; stored paths are `/about`, `/about/team`, `/about/team/berlin`
- `index` at root has path `/`
- empty slug is filled from title
- invalid slug returns 400 on `slug`
- same slug under the same parent returns 400; under a different parent it is allowed
- moving a page under its own descendant returns 400 on `parent`
- renaming a parent's slug rewrites all descendant paths in one transaction
- a failing descendant update rolls back the rename
- deleting a page with children returns 409; a leaf deletes
- `path` in input is overwritten by the hook
- `GET /api/cms/collections/pages?path=/about/team` returns the page
- omitting a hook by name disables it (e.g. without `uniquePath`, duplicates are allowed)
- `treeHooks()` with other field names, including `title`
- a flat collection with `{ type: 'slug', from: 'title', unique: true }` returns 400 on `slug` for a used slug

Admin (manual): `readOnly` fields are disabled; the slug fills live on new documents only, stops after a manual edit, and shows the parent's path as a prefix, also when the slug's `path` option names another field.
