# Page and SEO preset

Spec 5 of 6: group field, relation field, hooks, auth, page preset, field options. Execution order: 4, 1, 2, 3, 6, 5. Requires specs 1–3 and 6.

## Goal

Most websites need pages with nested URLs and SEO fields. The preset gives hosts a working start without hiding anything: it is plain field objects and named hook records, spread into the host's own collection file. Hosts omit, override and add fields and hooks with plain JavaScript. Starter templates and a CLI come later and are out of scope.

## Usage

```ts
import { defineCollection } from 'integral-cms'
import { page, seo } from 'integral-cms/presets'

export const pages = defineCollection({
  label: 'Pages',
  titleField: 'title',
  fields: { ...page.fields, ...seo.fields, body: { type: 'textarea' } },
  hooks: {
    beforeValidate: page.hooks.beforeValidate,
    beforeChange: page.hooks.beforeChange,
    afterChange: page.hooks.afterChange,
    afterRead: seo.hooks.afterRead,
  },
})
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

A catch-all route reads a page by its stored path:

```ts
const doc = await cms.findOne('pages', { where: { path: '/about/team' } })
// HTTP: GET /api/cms/collections/pages?path=/about/team
```

No `findByPath` helper: `path` is a stored field, so existing filters cover it.

## Package

- New subpath export `integral-cms/presets` (`src/presets.ts`, tsdown entry). Exports `page`, `seo`, `treeHooks`.
- One file. The preset source MUST stay short enough to read in one screen, because it is the documentation of what a host gets.

## Core addition: `readOnly`

`pattern` for `slug` comes from spec 6.

A field option for values only hooks set.

- `Base` gets `readOnly?: boolean`.
- The API strips `readOnly` fields from input before `beforeValidate`. Hooks set them afterwards.
- The admin shows them disabled.
- Types: `readOnly` fields are left out of `create` / `update` input types and stay in `Doc`.

## `page.fields`

| Field | Definition |
|---|---|
| `title` | `{ type: 'text', required: true }` |
| `slug` | `{ type: 'text', required: true, pattern: '[a-z0-9]+(-[a-z0-9]+)*' }` |
| `parent` | `{ type: 'relation', collection: 'pages', onDelete: 'restrict' }` |
| `path` | `{ type: 'text', readOnly: true }` |

- `onDelete: 'restrict'`: deleting a page with children returns 409 and lists them. No subtree is lost, no URL changes silently.
- A collection with another name overrides one line: `parent: { ...page.fields.parent, collection: 'docs' }`. The hooks read the collection name from their arguments.

## Paths

- A root page with slug `index` has path `/`.
- Any other root page: `/<slug>`.
- A child: `<parent path>/<slug>`, where a parent path of `/` adds no extra slash (`/child`).
- Paths are stored. Reads never compute them.

## `page.hooks`

Named records, built by `treeHooks()` with the default field names.

| Stage | Name | Does |
|---|---|---|
| `beforeValidate` | `slugFromTitle` | Fills an empty `slug` from `title`: lowercase, ASCII, non-alphanumerics to `-`, trimmed. |
| `beforeChange` | `noCycle` | `ValidationError` on `parent` if the parent is the document itself or one of its descendants. |
| `beforeChange` | `path` | Computes `path` from the parent's stored path and the slug. |
| `beforeChange` | `uniquePath` | `ValidationError` on `slug` if another document in the collection has the same path. |
| `afterChange` | `descendantPaths` | If `path` changed, calls `cms.update` on each direct child. Each child's own hooks recompute its path and recurse to its children. |

All run inside the write transaction (spec 3), so two parallel saves cannot claim the same path.

### `treeHooks(options?)`

```ts
treeHooks({ parent: 'parentCategory', slug: 'handle', path: 'url' })
```

Returns the same records for other field names. Every option defaults to the name used in `page.fields`. For trees without URLs, a host omits `path` and `uniquePath` and keeps `noCycle`.

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

## `seo.hooks`

- `afterRead.fallback`: an empty `seo.title` reads as the document's `title`. Nothing is stored, so the fallback follows title changes. `seo.description` has no fallback; the preset cannot know which field holds body text.

## Amendment to spec 3

`onDelete` effects (`set-null`, `cascade`) MUST run through the normal `update` and `delete` operations, with their hooks, in the same transaction. Otherwise a `set-null` on a tree parent leaves stale paths. Spec 3 is updated with this rule.

## Examples

The Astro example gets a `pages` collection built from the preset and a catch-all route `[...path].astro` reading by `path`, with `seo` in `<head>`. Nuxt and TanStack Start follow in the same change, each with its catch-all route.

## Out of scope

- Starter templates and a CLI
- Drafts and publish state (roadmap #2)
- Blocks and layouts
- Sharing image (needs media)
- Redirects on path change
- Localized paths

## Tests (TDD: write each test, run it RED, then make it GREEN)

Unit (`presets.test.ts`):

- `slugFromTitle`: umlauts, spaces, punctuation, leading and trailing dashes
- path rules: `index` at root is `/`, child of `/` is `/child`, nested child

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
- `path` in input is ignored
- `GET /api/cms/collections/pages?path=/about/team` returns the page
- `seo.title` falls back to `title` on read and is not stored
- omitting a hook by name disables it (e.g. without `uniquePath`, duplicates are allowed)

`schema.test.ts`:

- `path` is in `Doc` and not accepted in the `create` input type (`@ts-expect-error`)
