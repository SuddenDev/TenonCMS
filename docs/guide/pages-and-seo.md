# Pages and SEO

`tenoncms/presets` gives you pages with nested URLs and SEO fields. Each preset is a function that returns plain field objects and named hook records. You spread them into your own collection, so you see what you get and can omit, override and add fields and hooks.

## Presets in one line

`defineCms({ presets })` adds a whole collection or global, so you skip the spreading below:

```ts
import { menuPreset, pagesPreset, stringsPreset } from "tenoncms/presets";

defineCms({
  presets: [
    pagesPreset({ seo: true, localized: true, fields: { body: { type: "textarea" } } }),
    stringsPreset({ readMore: "Read more" }),
    menuPreset({ name: "mainMenu", depth: -1 }),
  ],
});
```

| Preset                   | Adds                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `pagesPreset(options)`   | Collection `pages`: `page()` with its hooks and `permalink`, `titleField: "title"`, and `seo()` with `seo: true` |
| `stringsPreset(entries)` | Global `strings` from [`strings()`](./localization.md#site-strings)                                              |
| `menuPreset(options)`    | Global `menu` from [`menu()`](./menus.md) on the Settings page, and its shared blocks                            |

- `name` sets the collection or global name. `pagesPreset({ name: "docs" })` also points `parent` at `docs`.
- `fields` come after the preset's fields. A key of the preset replaces its field.
- `hooks` of `pagesPreset` merge stage by stage. A hook with the name of a preset hook replaces it.
- Every other option is a collection or global option and wins over the preset's, like `label` or `localized`.
- Presets merge like your own entries. A name the host, a plugin or another preset uses throws. A block defined the same way is shared, so two unlimited menus with the same `blocks` work.
- `seo: true` has an image field, so it needs [media](./media.md).

To leave out a preset field or hook, use the fragments below.

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

| Result         | Value                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`        | The collection's template, else the site's, else `{title} · {site.title}`, with [placeholders](#placeholders) filled. The page's `seo.title` fills `{title}`, or is the whole title with `seo.fullTitle`. |
| `description`  | The page's `seo.description`, else the collection's template, else the site's, with placeholders filled. `undefined` when empty.                                                                          |
| `noindex`      | `true` when the page's or the site's `seo.noindex` is.                                                                                                                                                    |
| `canonical`    | The site `url` plus the page's `path`, or the page's own URL in `alternates` ([Localization](./localization.md)). Else `undefined`.                                                                       |
| `alternates`   | `{ hreflang, href }` entries for `hreflang` tags. Needs the read option `alternates: true`.                                                                                                               |
| `image`        | The page's `seo.image`, else the site's, as an absolute URL when the site has a `url`. Populate the image, or it does not count.                                                                          |
| `verification` | `{ name, content }` meta tags for the filled `google` and `bing` codes.                                                                                                                                   |

### Placeholders

Titles and descriptions are templates, on the page and in the `seo` settings. They are filled when `seoMeta()` runs, so a page follows changes to its title or to the site settings.

| Placeholder                      | Value                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `{title}`, `{excerpt}`, `{…}`    | A field of the document. Dots walk into groups and populated relations, like `{category.title}` |
| `{site.title}`, `{site.tagline}` | The `general` settings                                                                          |

- A missing value is empty. Separators at the start and end then go, so `{title} · {site.title}` without a site title gives `About`.
- A page's own `seo.title` fills `{title}` in the template, so `Buy watches` gives `Buy watches · Acme`. Turn on **Use as the full title** (`seo.fullTitle`) to use it as is. The switch shows once the title has text.
- A placeholder for a field the document does not have is empty, like `{excerpt}` on a page.

### Templates per collection

`seo()` takes templates for the documents of one collection. They win over the site's templates, so posts can read differently from pages:

```ts
// collections/posts.ts
export const posts = defineCollection({
  fields: {
    title: { type: "text", required: true },
    excerpt: { type: "textarea" },
    ...seo({ title: "{title} – Blog · {site.title}", description: "{excerpt}" }).fields,
  },
});

// The post route
const meta = seoMeta(post, { general, seo, templates: posts.fields.seo.templates });
```

- The order is the document's own value, then the collection's template, then the site's, then `{title} · {site.title}`.
- The admin reads the templates from the schema. `seoMeta()` runs on your site, so pass them as `templates`, or the site falls back to the site's templates.

#### Logic in a hook

Templates are text, so the admin and the site fill them the same way. For logic a placeholder cannot express, fill the field in a `beforeChange` hook:

```ts
// collections/posts.ts
hooks: {
  beforeChange: {
    // Fills an empty SEO description from the body. An editor's own text stays.
    seoDescription: ({ data }) =>
      data.seo?.description || !data.body
        ? data
        : { ...data, seo: { ...data.seo, description: excerpt(data.body, 150) } },
  },
},
```

- The value is stored like an editor's text, so every reader gets it and `seoMeta()` needs nothing. The hook runs on the server and MAY read other documents with `cms`.
- It is a snapshot: once it is in the form, it does not follow later edits of the body. Clear the field to fill it again.
- The admin's hints and preview see it only after a save. With drafts, the form keeps showing the empty field until the document opens again.

### The SEO editor

`seo()` sets `editor: "seo"` on its group. The admin then shows, like Payload's SEO plugin:

- "2/3 checks are passing" above the fields: the title has 30–60 characters, the description 120–160 (what Google shows on desktop and mobile), and the page or the site has an image.
- A length hint under the title and the description: "Too short", "Almost there", "Good" or "Too long", with the characters left. It counts what the site renders, so placeholders and the site default count.
- An **Auto-generate** button there, which copies the filled default into the field to edit it. For the title that is the part that fills `{title}`, unless it is the full title. An empty field shows the whole rendered default as its placeholder, template included, like `About · Acme`.
- The rest of the title template as muted text right after the typed SEO title, like `Buy watches · Acme`, so the count makes sense. It hides with **Use as the full title**.
- A search preview at the top, below the checks: the page URL (the site `url` plus the permalink), the title and the description.

The editor reads the `general` and `seo` globals of the content language and the collection's templates, and uses `seoMeta()`, so the preview is what the site renders. The lengths are fixed.

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

| Global    | Fields                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `general` | `title` (required), `tagline`, `url` (`https://…`), `favicon` (image)                                                                               |
| `seo`     | `title` (template, empty is `{title} · {site.title}`), `description` (template), `image` (social image), `verification.google` / `.bing`, `noindex` |

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
