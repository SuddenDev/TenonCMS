# Plan: Settings and navigation placement

Spec: `docs/superpowers/specs/2026-09-30-settings-design.md`.

Paths are relative to the repo root. Commands:

- One test: `npx vitest run <file> -t '<name>'` in `packages/core`. No build needed.
- Types: `pnpm -r typecheck` while a watcher runs, else `pnpm typecheck`. An unused `@ts-expect-error` is an error, so a type test is RED while the line compiles.
- Before done: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` (tsdown's d.ts build is the check for TS2589 and memory, see CLAUDE.md).

Every core task is RED then GREEN: write the listed tests, run them, see them fail for the right reason, then write the least code that passes. Admin tasks have no unit tests beyond `groupMenu()`; they are checked with `pnpm typecheck` and in the dev server (Task 9).

## Starting point

- `Collection` / `Global` (`packages/core/src/schema/index.ts`) have flat `label`, `group`, `icon`, `order`. `IconName` comes from `src/admin/icons.d.ts`.
- `Menu` and `Page.menu` live in `src/admin/index.d.ts`; `AdminOptions.media` is `Partial<Menu>`. Both `.d.ts` files are copied to `dist/admin` by `tsdown.config.ts`.
- `groupMenu()` (`src/admin/menu.ts`) hardcodes the fallback group `Content`.
- `useMenu()` (`packages/admin/src/shared/composables/useMenu.ts`) builds items from `schema.value` and `options.pages`; `NavGroup.vue` marks an item active by path prefix.
- `useBreadcrumbs.ts`: `meta.parent` is a string.
- `DocForm.vue` renders every field through `FieldInput.vue` in one column with one Save button; `GlobalEdit.vue` and `DocEdit.vue` have their own plain headers.
- shadcn components present: `alert-dialog`, `avatar`, `breadcrumb`, `button`, `collapsible`, `dialog`, `dropdown-menu`, `input`, `label`, `progress`, `separator`, `sheet`, `sidebar`, `skeleton`, `tooltip`. Missing: `card`, `item`, `field`.
- `defineCms()` (`src/cms/index.ts`): `mergePlugins()`, then the media collection, then `checkSchema()`. The instance type intersects `G & PluginGlobals<PL>`; `MediaCollections<M>` shows the non-distributive pattern.
- Tests: `src/tests/setup.ts` has a `site` global. `presets.test.ts` and `reads.test.ts` use the `seo` field preset. Media is on by default in tests unless an instance passes `media: false`.
- `nav`-like keys in use: `README.md` (~line 836), `examples/*/integral.admin.ts` (`menu:` on pages, "No menu" comments on detail pages), `examples/astro/collections/{posts,authors}.ts` (`group`, `icon`), `src/schema/types.test.ts` (~line 280), `src/plugins/redirects/admin.ts`, `packages/admin/src/router.ts` (`menu?.label`).
- `site` global in use: all four `examples/*/integral.config.ts`, `examples/astro/src/pages/index.astro`, `examples/nuxt/app/pages/index.vue`, `examples/tanstack-start/src/routes/index.tsx`. `seoMeta(page)` in the three site examples' catch-all routes.

## Decisions

- **`Nav` lives in `src/admin/index.d.ts`** next to `Page`, and `schema/index.ts` imports it with `import type { Nav } from "../admin/index.d.ts"`, like `IconName`. If the core d.ts build inlines more than `Nav` or fails, move `Nav` to `src/admin/nav.d.ts`, add it to tsdown `copy`, and import it from both. Check `dist/index.d.mts` in Task 1.
- **The settings merge** is a small function `addSettings(schema, option, hasMedia)` in `src/cms/index.ts`, called after `mergePlugins()` and before the media collection. It throws `integral-cms: duplicate global "<name>"` like `mergePlugins()`. The globals themselves are data in `src/presets/settings.ts`.
- **Without media**, `addSettings()` strips `favicon` from `general` and `image` from `seo` by destructuring. It never touches a host replacement.
- **`SettingsGlobals<S>`** lives in `src/cms/options.ts` next to `PluginGlobals`. `CmsOptions` gets `S extends SettingsOption | undefined = undefined` and `settings?: S & NoInfer<…>`: generic inference skips excess property checks (Gotchas), so extra keys are mapped to `never` explicitly.
- **Sidebar active state**: `MenuItem` gets `also?: string[]`, extra paths that mark it active. The Settings item lists the targets of every settings item. `NavGroup.vue`'s `active()` checks them too.
- **`meta.parent`** becomes `string | ((route) => string | undefined)`. The collection and global routes use a function that reads `schema.value` and returns `/settings` for `nav.display === "settings"`.
- **Form layout** lives in `DocForm.vue` (cards) plus one small shared header component, `modules/documents/components/FormHeader.vue` (back link, title, description, actions slot), used by `GlobalEdit.vue` and `DocEdit.vue`. The top Save button submits the form through `form="<id>"`, so `DocForm` keeps owning the submit.

## Task 1: `Nav` type and schema keys

Tests in `src/schema/types.test.ts` (replace the block at ~line 280):

- `defineCollection({ description: "d", nav: { display: "settings", group: "Blog", icon: "newspaper", order: 5 }, fields: {} })` compiles; same for `defineGlobal`.
- `@ts-expect-error` on `nav: { display: "sidebar" }`, on `nav: { icon: "not-an-icon" }`, and on a top-level `group: "Blog"` (the key is gone; use `satisfies Collection`, because `defineCollection()` inference skips excess checks).

Code:

- `src/admin/index.d.ts`: add `Nav` with JSDoc on every property and every `display` value. `Page`: `label?`, `description?`, `route?`, `nav?: Nav`, `mount`; remove `menu` and `Menu`. `AdminOptions.media`: `{ label?: string; nav?: Nav }`. Update every `@example`.
- `src/schema/index.ts`: `Collection` and `Global` drop `group` / `icon` / `order`, get `description?: string` and `nav?: Nav` with JSDoc.
- `/schema` already sends every non-function key; add one assertion to `reads.test.ts` that `nav` and `description` come through.
- Fix compile errors in core (`types.test.ts`, `plugins/redirects/admin.ts`: `{ label: "Redirect tools", nav: { icon: "arrow-right-left", order: 11 }, mount }`).
- `pnpm --filter integral-cms build`, then check `dist/index.d.mts` for `Nav` (see Decisions).

## Task 2: `groupMenu()` fallback

Tests in `src/admin/menu.test.ts`:

- `groupMenu(items, "Site")` puts items without a group into `Site`.
- The existing tests still pass without the argument (`Content`).

Code: `groupMenu<T>(items: T[], fallback = "Content")`.

## Task 3: Settings presets

Tests in `src/tests/settings.test.ts` (new), first block "presets":

- `settings.general.fields` has `title` (required), `tagline`, `url` (pattern accepts `https://a.b`, rejects `a.b`; check through `parseData()` on an instance), `favicon` (image).
- `settings.seo.fields` has `separator` (default `" · "`), `image`, `verification.google`, `verification.bing`, `noindex`.
- Both have `nav.display === "settings"`, `nav.group === "Site"`, orders 1 and 2, a `label` and a `description`, and every field has a `description`.
- `settings` comes from `integral-cms/presets` (`../presets/index.ts`).

Code: `src/presets/settings.ts` with `general` and `seo` as `const` globals (`satisfies Global`), exported as `settings = { general, seo }` from `src/presets/index.ts`. Imports only types. Also `seo.ts`: add `image: { type: "image" }` to the `seo` group.

- Then run the full suite. Any instance with `media: false` that uses `seo.fields` now fails `checkSchema()`: fix the test by destructuring `image` out, which is also what the README will show.

## Task 4: `settings` option in `defineCms()`

Tests in `src/tests/settings.test.ts`, block "defineCms":

- Omitted: `cms.getGlobal("general")` and `getGlobal("seo")` resolve to `{}`. `setGlobal("general", { title: "Site", url: "https://a.b" })` stores; a missing `title` is a 400-style `ValidationError` keyed `title`.
- `{ seo: false }`: `getGlobal("seo")` rejects (unknown global), `general` still works. `settings: false`: both reject.
- `{ general: { label: "Mine", fields: { name: { type: "text" } } } }`: stored under `general`, validated by its own fields (`title` not required).
- A host global named `general` throws `duplicate global "general"` while the default is on; with `{ general: false }` it is allowed. Same for a plugin global named `seo`.
- `media: false`: `general` has no `favicon`, `seo` has no `image`; `setGlobal` with only `title` works (startup does not throw).
- Over HTTP: `GET /api/cms/globals/general` answers 200 `{}` without a session.

Code: `SettingsOption` type and the `settings` key in `CmsOptions` (JSDoc with the three forms), `addSettings()` in `src/cms/index.ts`.

- Then run the full suite. `setup.ts` and other instances now carry two more globals: fix tests that count globals or snapshot `/schema` by passing `settings: false`, not by loosening the assertion. Replace the `site` global in `setup.ts` only if a test depends on its name.

## Task 5: Settings types

Tests in `src/schema/types.test.ts`, block "settings":

- Omitted: `(await cms.getGlobal("general")).title` is `string` (or `string | undefined` for an unsaved global; match what `getGlobal` types today for a required field), `(await cms.getGlobal("seo")).verification?.google` compiles.
- `{ general: false }`: `@ts-expect-error cms.getGlobal("general")`; `seo` still typed. `settings: false`: both errors.
- A replacement's own fields are typed; the default's fields are not (`@ts-expect-error … .tagline`).
- `@ts-expect-error settings: { other: {…} }` (put the directive right above the line with the bad key, Gotchas).
- `defineCms({ … } as never)` still compiles (the `S = never` case).
- The client: `createClient<typeof cms>().getGlobal("general")` is typed.

Code: `SettingsGlobals<S>` in `src/cms/options.ts`, non-distributive (`[S] extends [false]`, `[S] extends [undefined]`), per-key lookups; `globals` in the instance type `T` becomes `G & PluginGlobals<PL> & SettingsGlobals<S>`. Run `pnpm build` after this task: tsdown's d.ts build must still finish.

## Task 6: `seoMeta(doc, settings)`

Tests in `src/helpers/seo-meta.test.ts` (existing ones get `verification: []` in their expected objects):

- Title: `Hello · Site` with `general.title`, a custom `separator`, `doc.seo.title` over `doc.title`, only the page title without `general.title`, an empty `general.title` counts as missing.
- `noindex`: `true` from the page or from `seo.noindex`, `false` otherwise.
- `canonical`: `https://a.b/about` from `url: "https://a.b"` (and `"https://a.b/"`) plus `path: "/about"`; absent without either.
- `image`: the page's `seo.image.url` wins over `seo.image.url`; relative URLs become absolute with `general.url`, stay relative without it; an id string is ignored; absent when neither exists.
- `verification`: both names for filled fields, `[]` for empty strings, `null` or no settings.
- `description`: no fallback to the tagline.

Code: `src/helpers/seo-meta.ts`, still without imports. Update the JSDoc and `src/helpers/README.md`.

## Task 7: Admin navigation

No unit tests (see top). `pnpm --filter @integral-cms/admin typecheck` after each step.

- `useMenu.ts`: items from collections, globals, pages and media carry `nav` defaults (orders as today). Keep items whose `display` is `menu` or unset. Pages: `label ?? key`, no longer "only with `menu`". Media: `{ label: "Media", icon: "image", order: 15, ...options.media?.nav, label: options.media?.label ?? "Media" }`.
- New `useSettings()` in the same file (or `modules/settings/useSettings.ts`, if `useMenu.ts` grows past one screen): the `display: "settings"` items as `{ label, description, icon, order, group, to }`, grouped with `groupMenu(items, "Site")`.
- `useMenu()` appends `{ label: "Settings", icon: "settings", group: "Admin", order: 100, to: "/settings", also: [...settings targets] }` when `useSettings()` has items.
- `MenuItem`: `also?: string[]`. `NavGroup.vue`: `active(item)` checks `to` and `also`.
- `router.ts`: `hostPage()` titles use `p.label ?? key`; page breadcrumbs use `p.label ?? key`, and `meta.parent: "/settings"` for pages with `nav.display === "settings"`. Collection and global routes get `parent: (r) => …` (see Decisions). Add `{ path: "/settings", component: Settings, meta: { breadcrumb: "Settings" } }`.
- `useBreadcrumbs.ts`: `parent` type widens to a function; `trail()` calls it with the resolved route.
- `mergeOptions()` is unchanged (`media` passes through).

## Task 8: Admin UI (shadcn)

- `pnpm dlx shadcn-vue@latest add card item field` in `packages/admin`. Then, per Gotchas: replace every `@lucide/vue` import in the new files with `Icon.vue`, and remove the Google Fonts `@import` the CLI puts into `style.css`. `rg "@lucide/vue" packages/admin/src` MUST only hit `Icon.vue`.
- `modules/settings/views/Settings.vue`: title "Settings", then one section per group: heading (`text-lg font-semibold`), an `ItemGroup` inside a bordered, rounded container with `ItemSeparator` between rows. Row: `ItemMedia` with `Icon`, `ItemContent` with `ItemTitle` and `ItemDescription`, `ItemActions` with a `chevron-right` icon; the whole row is a `RouterLink` (`as-child`). Width `max-w-3xl`. Empty state when there are no items. Only theme tokens.
- `modules/documents/components/FormHeader.vue`: back `RouterLink` (ghost icon button, `arrow-left`), `h1` title, `description` in `text-muted-foreground`, an actions slot on the right.
- `DocForm.vue`: split top-level fields into one card of ungrouped fields (in their order) and one card per `group` field (`CardHeader` with the group label and description, `CardContent` with its children). A group card renders its children through `FieldInput` with the group's value as model, so paths, conditions and errors stay as they are; nested groups stay `<fieldset>`. Fields inside a card are separated like EmDash (`divide-y` or `FieldSeparator`). Give the `<form>` an `id` prop so a button outside can submit it. Save row at the bottom stays (status and error messages next to it).
- `FieldInput.vue`: move label, description and error markup to `Field` / `FieldLabel` / `FieldDescription` / `FieldError`. Keep `MediaField` outside a `<label>`. Behavior (attributes, `readOnly`, conditions) is unchanged.
- `GlobalEdit.vue`: `FormHeader` with `global.label ?? name`, `global.description`, back to the parent crumb (`/settings` or `/`), and a Save button with `form=` in the actions slot.
- `DocEdit.vue`: same header (back to the collection list, title as today, collection `description`), Delete stays next to the bottom Save through the slot.
- `CollectionList.vue`: show the collection's `description` under its heading.

## Task 9: Examples, plugin and docs

- Examples: remove the `site` global from all four `integral.config.ts`. Home pages read `general` (`title`, `tagline`). The three catch-all routes read `general` and `seo` and pass them to `seoMeta()`; render `canonical`, `og:image` and the verification tags when set.
- `examples/astro/collections/{posts,authors}.ts`: `nav: { group: "Blog", icon: … }`. `integral.admin.ts` files: pages to `label` + `nav`; detail pages get `nav: { display: "none" }` (the "No menu" comments go). Astro's `media` option becomes `{ nav: { group: "Blog", icon: "images" } }`.
- One example (Astro) adds a host global on the hub, e.g. `footer` with `nav: { display: "settings", group: "Site", order: 3 }`, so the hub shows a third card.
- Docs: `README.md` (settings, `nav`, `seoMeta`, admin pages), `packages/core/src/README.md`, `src/presets/README.md` (`settings.ts`), `src/admin/README.md` (`menu.ts` fallback), `CLAUDE.md` (Architecture: `nav`, `settings` / `addSettings()`, `SettingsGlobals`, the hub in `modules/settings/`, `FormHeader`, `also`, function `meta.parent`; Examples: `general` replaces `site`).

## Task 10: Verify

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`.
- `pnpm dev:astro`, then in the browser (light and dark): sidebar has no `general` / `seo`, has "Settings" under "Admin" and marks it active on `/globals/seo`; hub shows Site with General, SEO, Footer in that order; each card opens its form; breadcrumbs read `Settings › SEO`; the form shows ungrouped fields in one card and `verification` in its own; both Save buttons save; a validation error marks the field; a post edit uses the same layout; a detail page with `display: "none"` is not in the sidebar but opens.
- Smoke test on a temp DB and uploads dir (memory: never inside `examples/*`): `GET /api/cms/globals/general` is `{}`, `POST` a session, `PUT` the global, read it back; the catch-all page HTML contains the composed title.
