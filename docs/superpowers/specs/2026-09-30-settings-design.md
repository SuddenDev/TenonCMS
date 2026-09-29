# Settings and navigation placement

## Goal

Most sites need a few settings from day one: a site title, a URL, SEO defaults. Today a host builds them as a plain global that sits in the sidebar next to content. This spec adds:

- `nav`, one placement option for collections, globals, admin pages and the media library: the sidebar, the settings hub, or nowhere.
- A settings hub at `/settings`, structured like EmDash's: sections of cards, each opening a global, a collection or a page.
- Two default settings globals, `general` and `seo`, on by default, each one omittable, replaceable and extendable through the `settings` option of `defineCms()`.
- `seoMeta(doc, settings)`, which uses them.
- An EmDash-like form layout for globals and documents: fields in cards, a header with description and save.

User management and import/export are later built-in areas with their own specs. Redirects stay where they are.

## Usage

```ts
import { defineCms, defineGlobal } from "integral-cms";
import { settings } from "integral-cms/presets";

defineCms({
  // Omitted: `general` and `seo`. `{ seo: false }` drops one, `settings: false` drops both.
  settings: {
    general: {
      ...settings.general,
      fields: { ...settings.general.fields, analyticsId: { type: "text" } },
    },
  },
  globals: {
    footer: defineGlobal({
      label: "Footer",
      description: "Links and copyright line",
      nav: { display: "settings", group: "Site", icon: "panel-bottom", order: 3 },
      fields: { copyright: { type: "text" } },
    }),
  },
});
```

```ts
const [general, seo] = await Promise.all([cms.getGlobal("general"), cms.getGlobal("seo")]);
const meta = seoMeta(page, { general, seo });
```

## `nav`

One type, `Nav`, in `src/admin/index.d.ts`. The schema types import it with `import type`.

```ts
type Nav = {
  /** `menu`: the sidebar (default). `settings`: a card on the settings hub. `none`: no entry; the route still works. */
  display?: "menu" | "settings" | "none";
  /** Sidebar section, default `Content`. Hub section, default `Site`. */
  group?: string;
  /** Lucide icon of the sidebar entry or the card. */
  icon?: IconName;
  /** Position in the sidebar or in the hub section, lowest first. */
  order?: number;
};
```

- `Collection` and `Global`: `group`, `icon` and `order` move into `nav`. `label` stays. New: `description`, the subtitle of the card and of the page header.
- `Page` (admin): `menu` is removed. `label` and `description` move to the top level (`label` defaults to the key), placement goes into `nav`. A page is in the sidebar unless `nav.display` says otherwise, so a detail route like `/reports/:id` sets `display: "none"`.
- `AdminOptions.media`: `{ label?, nav? }` instead of `Partial<Menu>`. Defaults stay `Media`, `Content`, `image`, 15.
- `Menu` is removed.
- Core never reads `nav` or `description`. `/schema` sends them, like `label`.
- Default orders stay: collections 10, media 15, globals 20, pages 30.

No back-compat: nothing is published. Examples, the redirects plugin and the docs move to the new keys.

## Default settings

`src/presets/settings.ts`, exported as `settings` from `integral-cms/presets` (the name `seo` is taken by the field preset). Plain `Global` objects, readable without core internals, like the other presets.

| `general`                                                                            | `seo`                                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `title`: text, required                                                              | `separator`: text, default `" · "`                                  |
| `tagline`: text                                                                      | `image`: image, fallback social image, "Recommended size: 1200×630" |
| `url`: text, pattern `https?://\S+`, "Site URL, used for canonical and social links" | `verification`: group with `google`, `bing` (text)                  |
| `favicon`: image                                                                     | `noindex`: boolean, "Hide from search engines"                      |

- `nav`: `{ display: "settings", group: "Site" }`, icons `settings` and `search`, orders 1 and 2. Labels `General` and `SEO`, with a `description` each.
- Every field has a `description`.

### `settings` option

```ts
settings?: false | { general?: Global | false; seo?: Global | false };
```

- An omitted key is the default. `false` drops it. A `Global` replaces it and is stored under the same name.
- `settings: false` drops both.
- `defineCms()` adds them to `schema.globals` after `mergePlugins()`, before `checkSchema()`. A host or plugin global named `general` or `seo` while that default is on throws, like a duplicate plugin name.
- Without media, the defaults leave out `favicon` and `image`. A replacement global is taken as is, so `checkSchema()` rejects its `image` fields as usual.
- Other keys are a type error. Host settings pages are globals with `nav.display: "settings"`, so there is one way to place a global on the hub.

### Types

`SettingsGlobals<S>` is intersected into the instance's `globals`, next to `PluginGlobals<PL>`: omitted means both defaults, a `false` key removes that one, an object key uses its own type. The types keep `favicon` and `image` without media; both are optional, so a read never has them then. Like `MediaCollections`, it is not distributive and treats `S = never` as omitted, so `defineCms({ ... } as never)` does not hit TS2589. The client and `useIntegral()` get the globals through `Register`.

An unsaved global reads as `{}` (`readGlobal()`), so templates MUST handle a missing `title`.

## `seoMeta()`

```ts
seoMeta(doc, settings?: { general?: GeneralDoc | null; seo?: SeoSettingsDoc | null })
```

| Output         | Value                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`        | `doc.seo.title` or `doc.title`, then `seo.separator` (default `" · "`) and `general.title`. Only the page title when there is no `general.title`.            |
| `description`  | `doc.seo.description`. No fallback: the tagline on every page gives duplicate descriptions.                                                                  |
| `noindex`      | `true` when `doc.seo.noindex` or `seo.noindex` is `true`.                                                                                                    |
| `canonical`    | `general.url` joined with `doc.path`, only when both exist.                                                                                                  |
| `image`        | URL of `doc.seo.image`, else of `seo.image`, absolute against `general.url` when it is set. Only a populated media document counts; an id string is ignored. |
| `verification` | `{ name, content }[]`: `google-site-verification`, `msvalidate.01`, for the filled fields.                                                                   |

- The file keeps no imports (`URL` is a global).
- Without the second argument the result is what it is today, plus `verification: []`.
- The `seo` field preset gets `image: { type: "image" }`. A host without media omits it by destructuring, like any preset field.
- The Astro, Nuxt and TanStack examples pass the settings. Their `site` global goes; `general` replaces it.

## Admin

Styling is shadcn-vue with the admin's theme tokens. EmDash is the guide for structure, not for colors. New shadcn components (`item`, `card`, `field`) come through the CLI; generated icon imports MUST be switched to `Icon.vue`, and the CLI's Google Fonts `@import` removed (see Gotchas).

### Sidebar

- `useMenu()` lists items whose `nav.display` is `menu` or unset.
- A "Settings" entry (`settings` icon, group `Admin`, order 100) appears when at least one item has `display: "settings"`.
- `groupMenu(items, fallback)` gets the default group as a parameter: `Content` for the sidebar, `Site` for the hub.

### Hub

- `modules/settings/views/Settings.vue` at `/settings`, breadcrumb "Settings".
- Sections from `groupMenu()`, each a heading and an `ItemGroup` in a bordered, rounded container with separators. A row: icon, label, description (muted), chevron. Narrow column, like the form.
- A card links to the item's existing route: `/globals/:name`, `/collections/:name` or the page's route. No new routes, and old links keep working.
- With no settings items, `/settings` shows an empty state.

### Breadcrumbs and active state

- `meta.parent` MAY be a function of the route. `/globals/:name` and `/collections/:name` return `/settings` when the item's `nav.display` is `settings`; host pages on the hub get `/settings` statically.
- The sidebar marks "Settings" active on those routes.

### Form layout

For `GlobalEdit.vue` and `DocEdit.vue` (the change reaches collection documents too):

- Header: back link (to the parent crumb), title, `description`, save button. A second save button under the form.
- `DocForm.vue`: top-level fields without a group share one card. Each top-level `group` is its own card with its label as heading and its `description` below. Nested groups stay `<fieldset>` inside their card.
- Fields render with shadcn `Field` / `FieldLabel` / `FieldDescription` / `FieldError`, separated inside a card like EmDash's.
- Conditions, `readOnly`, errors and `normalize()` keep their behavior.

## Redirects plugin

Only moves to the new keys: the tools page becomes `{ label: "Redirect tools", nav: { icon: "arrow-right-left", order: 11 }, mount }`. The `redirects` collection stays in the sidebar.

## Testing

Core, test first:

- `src/tests/settings.test.ts` (integration): defaults exist and read as `{}` before a save; `{ seo: false }` and `settings: false` drop them; a replacement is stored under the default name and validated with its own fields; a host or plugin global named `general` throws; with `media: false` the defaults have no `image` fields; `/schema` sends `nav` and `description`.
- `helpers/seo-meta.test.ts`: every output row above, including missing settings, an unpopulated image id and a relative image without `general.url`.
- `admin/menu.test.ts`: `groupMenu()` with a fallback group.
- `schema/types.test.ts`: `getGlobal("general")` typed by default, gone with `{ general: false }` and `settings: false`, a replacement's own fields typed, `settings: { other: … }` is an error.

Admin and examples: `pnpm typecheck`, then the dev server: hub sections, card links, breadcrumbs, active state, both form layouts, dark mode. Smoke test: `GET /api/cms/globals/general` answers `{}` on a fresh DB, and 200 after a save.

## Docs

`README.md`, `src/README.md`, `src/presets/README.md`, `CLAUDE.md` (architecture: `nav`, settings, hub, `groupMenu` fallback) and JSDoc on every new option and enum value.

## Out of scope

- Social links: a host global with `display: "settings"` covers them.
- `robots.txt`: the host owns its routes.
- An option to rename or move the Settings sidebar entry.
- A combined settings read, e.g. `cms.settings()`.
- User management and import/export (own specs), a Tools section.
