# Pages and SEO

`tenoncms/presets` gives you pages with nested URLs and SEO fields. Each preset is a function that returns plain field objects and named hook records. You spread them into your own collection, so you see what you get and can omit, override and add fields and hooks.

## The page preset

```ts
// collections/pages.ts
import { defineCollection } from "tenoncms";
import { page, seo } from "tenoncms/presets";

const preset = page();

export const pages = defineCollection({
  label: "Pages",
  titleField: "title",
  fields: { ...preset.fields, ...seo().fields, body: { type: "textarea" } },
  hooks: preset.hooks,
});
```

`page()` takes one option, `collection`: the collection the pages live in, which `parent` points to. Default `'pages'`.

`page().fields`:

| Field    | Definition                                                                        |
| -------- | --------------------------------------------------------------------------------- |
| `title`  | `{ type: 'text', required: true }`                                                |
| `slug`   | `{ type: 'slug', from: 'title', parent: 'parent', path: 'path', required: true }` |
| `parent` | `{ type: 'relation', collection: 'pages', onDelete: 'restrict' }`                 |
| `path`   | `{ type: 'text', readOnly: true }`                                                |

`seo().fields` is one optional group `seo` with `title`, `description`, `image` (the social image) and `noindex`. Without [media](./media.md), leave `image` out.

Paths are stored, so reads never compute them:

- A root page with slug `index` has path `/`. Any other root page has `/<slug>`.
- A child has `<parent path>/<slug>`, like `/about/team`. A child of `/` has `/<slug>`.
- A page with children cannot be deleted (409, `restrict`), so no subtree is lost.

`page().hooks`:

| Stage          | Name               | Does                                                                                                                      |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `beforeChange` | `validParent`      | 400 on `parent` if the parent is the page itself or one of its descendants                                                |
| `beforeChange` | `buildPath`        | Sets `path` from the parent's path and the slug. It overwrites any `path` in the input                                    |
| `beforeChange` | `uniquePath`       | 400 on `slug` if another page has the same path                                                                           |
| `afterChange`  | `updateChildPaths` | When `path` changes, saves each child again with no changes, so its `buildPath` runs and the whole subtree gets new paths |

The slug itself needs no hook: `from: 'title'` fills an empty slug on the server too. All hooks run in the write's transaction, so a failing child update rolls back the rename, and two parallel saves cannot claim the same path.

### Customize

Use plain JavaScript:

```ts
const docs = page({ collection: 'docs' })
const seoGroup = seo().fields.seo
const { image, ...seoRest } = seoGroup.fields
const { uniquePath, ...beforeChange } = docs.hooks.beforeChange

fields: {
  ...docs.fields,
  seo: { ...seoGroup, fields: { ...seoRest, keywords: { type: 'text' } } },
},
hooks: { beforeChange, afterChange: docs.hooks.afterChange },
```

`nestedPaths()` returns the same hooks for other field names. Every option defaults to the name in `page().fields`. The slug's `path` option MUST name the same path field, so the admin shows the right prefix:

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

## Read a page

Read a page by its path like any other field:

```ts
const doc = await cms.findOne("pages", {
  where: { path: "/about/team" },
  populate: { seo: { image: true } },
});
// HTTP: GET /_tenon/collections/pages?path=/about/team
```

Each example has a catch-all route that does this. Static routes win over it, so a CMS page at `/` never shows.

- Astro: `src/pages/[...path].astro` with `Astro.locals.tenon.findOne` and `select`
- Nuxt: `app/pages/[...path].vue` with `useTenon().findOne` and `useSeoMeta`
- TanStack Start: `src/routes/$.tsx` with a server function and `head`

## SEO tags

Build `<head>` with `seoMeta()`:

```ts
import { seoMeta } from "tenoncms";

const [general, seo] = await Promise.all([cms.getGlobal("general"), cms.getGlobal("seo")]);
const doc = await cms.findOne("pages", {
  where: { path: "/about/team" },
  populate: { seo: { image: true } },
});
const { title, description, noindex, canonical, alternates, image, verification } = seoMeta(doc, {
  general,
  seo,
});
```

The second argument is optional. It takes the [settings](#settings) globals `general` and `seo`.

| Result         | Value                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `title`        | `seo.title`, or the page's `title` when empty, then the separator (default `·`) and the site title. Nothing is stored.              |
| `description`  | `seo.description`, or `undefined`. There is no fallback, so pages do not share one description.                                     |
| `noindex`      | `true` when the page's or the site's `seo.noindex` is.                                                                              |
| `canonical`    | The site `url` plus the page's `path`, or the page's own URL in `alternates` ([Localization](./localization.md)). Else `undefined`. |
| `alternates`   | `{ hreflang, href }` entries for `hreflang` tags. Needs the read option `alternates: true`.                                         |
| `image`        | The page's `seo.image`, else the site's, as an absolute URL when the site has a `url`. Populate the image, or it does not count.    |
| `verification` | `{ name, content }` meta tags for the filled `google` and `bing` codes.                                                             |

`seoMeta()`, `breadcrumbs()`, `slugify()` and `SLUG_PATTERN` come from `tenoncms`. In browser code, import them from `tenoncms/client`, which pulls no server code.

## Breadcrumbs

`breadcrumbs()` builds the trail from a page read with its parents resolved. Read only what the trail needs with [`select`](./reading.md):

```astro
---
import { breadcrumbs } from "tenoncms";

const page = await Astro.locals.tenon.findOne("pages", {
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

- The trail has one entry per document from the root down to the page itself. A root page has one entry.
- The walk stops at a `parent` that is not a document: `null`, missing, or an id that `populate` did not resolve. It makes no queries, so resolve as many levels as your tree has. The trail then starts at the last resolved ancestor.
- Options name the fields: `breadcrumbs(doc, { title: 'name', path: 'url', parent: 'up' })`. They default to `title`, `path` and `parent`. A missing title or path reads as `''`.

## Settings

Most sites need a title, a URL and SEO defaults. `defineCms()` adds two globals for that, `general` and `seo`, with no config:

| Global    | Fields                                                                                        |
| --------- | --------------------------------------------------------------------------------------------- |
| `general` | `title` (required), `tagline`, `url` (`https://…`), `favicon` (image)                         |
| `seo`     | `separator` (default `·`), `image` (social image), `verification.google` / `.bing`, `noindex` |

With `localization` and an entry that has a localized group, array or blocks field, a third global, `translations`, holds the default structure setting of each such entry (see [Localization](./localization.md#same-content-structure-in-all-languages)). `settings: { translations: false }` drops it.

They appear on the admin's Settings page, not as menu entries, and read like any global: `await cms.getGlobal("general")`. An unsaved global reads as `{}`, so handle a missing `title`. Without [media](./media.md), `favicon` and `image` are left out.

The `settings` option drops or replaces them:

```ts
import { settings } from "tenoncms/presets";

const { general } = settings();

defineCms({
  settings: {
    // Extend the default.
    general: { ...general, fields: { ...general.fields, analyticsId: { type: "text" } } },
    // Drop one. `settings: false` drops both.
    seo: false,
  },
});
```

- An omitted key is the default. `false` drops it. A global replaces it and is stored under the same name. Other keys are type errors: add your own settings pages as globals with `nav: { display: "settings" }` (see [Customize the admin](./admin.md)).
- A host or plugin global named `general` or `seo` throws at startup while that default is on.
- A replacement is taken as is, so an `image` field in it needs media.
