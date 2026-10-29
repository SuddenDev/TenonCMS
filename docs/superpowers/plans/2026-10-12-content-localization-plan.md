# Content localization: implementation plan

Spec: `docs/superpowers/specs/2026-10-12-content-localization-design.md`. Paths are relative to `packages/core/src` unless they start with `packages/` or `examples/`.

Rules for every task:

- TDD: write the test, run it, see it fail for the right reason, then the least code that passes. One test: `npx vitest run <file> -t '<name>'` in `packages/core`.
- After each phase: `pnpm test` and `pnpm -r typecheck` (or `pnpm typecheck` when no watcher runs). After any change in `packages/*` that an example uses: `pnpm build:packages`.
- Unlocalized collections MUST behave exactly as now. The existing suite is the regression check; it MUST stay green after every task.
- No commits unless asked.

Phases build on each other in order. Phase 1 is independent of localization and can ship alone.

---

## Phase 1: `permalink`

### 1.1 Config and resolver

- `collections/config/types.ts`, `globals/config/types.ts`: `permalink?: Preview` with JSDoc ("Template of the document's public URL. The host's routes MUST serve it. `preview` defaults to it.").
- `preview/config/types.ts`: the function form gets `locale?: string` in its second argument (unused until phase 5).
- `preview/server/resolve-url.ts`: rename the core to `resolveUrl(entry, template, data, cms)`; `previewUrl()` calls it with `entry.preview ?? entry.permalink`. Add `permalinkUrl()` with `entry.permalink`.
- `schema/validation/check-schema.ts`: check `permalink` placeholders like `preview`'s.
- `schema/endpoints/read.endpoint.ts`: `preview: true` when `preview` or `permalink` is set.

Tests (red first):

- `preview/server/resolve-url.test.ts` (new): `preview` falls back to `permalink`; an explicit `preview` wins; `permalinkUrl()` ignores `preview`.
- `schema/validation/check-schema.test.ts`: a bad `permalink` placeholder throws.
- `src/tests/` preview-url integration (where the preview-url endpoint is tested now): a collection with only `permalink` answers its URL.

### 1.2 Preset and examples

- `presets/page.ts`: `preview` becomes `permalink` (`"{path}"`), JSDoc updated.
- Examples: `pages` uses `permalink: page.permalink`, `posts` uses `permalink: "/posts/{slug}"`.
- README and CLAUDE.md mentions of `page.preview`.

Verify: `pnpm test`, `pnpm typecheck`, open the Astro example's admin preview once.

---

## Phase 2: Config, checks, storage

### 2.1 Config types

- `cms/config/options.ts`: `LocalizationOptions` (`locales: readonly string[]`, `defaultLocale`, `fallback?`, `routing?: { prefix: "except-default" | "always" } | false`), with JSDoc on each property. `CmsOptions.localization?`. Infer `L` like the other generics so `locales` stays a literal union.
- `collections/config/types.ts`, `globals/config/types.ts`: `localized?: boolean` (JSDoc).
- `schema/fields/common.ts`: `localized?: false` on `Common` (only `false` is meaningful; `true` is the collection's).
- `cms/runtime/types.ts`: `Core.localization?: Required<LocalizationOptions>` (normalized: `fallback` true, `routing` `{ prefix: "except-default" }`).
- `cms/create-cms.ts`: normalize and put it on `Core`.

### 2.2 Startup checks

`schema/validation/check-schema.ts`, rules from spec section 1. It needs the localization config, so pass it in.

Tests in `check-schema.test.ts`, one per rule: `localized` without `localization`; a field `localized` outside a localized entry; `localized` inside a localized group; localized `media`; `defaultLocale` not in `locales`; empty `locales`; duplicates.

### 2.3 Settings globals

- `cms/config/site-settings.ts` (`addSettings()`): with `localization`, the default `general` and `seo` get `localized: true`. A host replacement is taken as is.
- Test next to the existing settings tests.

### 2.4 `/schema`

- `schema/endpoints/read.endpoint.ts`: add `localization: { locales, defaultLocale }` when set; `localized` stays in each entry (it is JSON already).
- Integration test in the area that covers `/schema`.

### 2.5 Migration

- `db/migrations/cms.ts`: `005_cms_locales` with `cms_document_locales`, `cms_global_locales` and `cms_schema_state` (spec section 2). Index `cms_document_locales (locale)`.
- `db/types.ts`: the three tables.
- `db/migrations/migrate.test.ts`: the tables exist after migrate.

### 2.6 Field classification

`schema/traversal/localized-fields.ts` (new): `localizedKeys(entry)` → the top-level keys whose values live in locale rows (a top-level group is one key: groups are localized as a whole). `[]` for unlocalized entries.

Unit test `localized-fields.test.ts`: default on, `localized: false` opt-out, groups as one key, unlocalized entry.

---

## Phase 3: Merge and split

Pure functions, no DB.

### 3.1 `content/reads/merge-locale.ts`

`mergeLocale(keys, shared, localized, fallback)`: shared object plus, per key, `localized[key]` → `fallback?.[key]` → `null`. Unit tests: value present, missing, `null` falls back, fallback off, keys outside `keys` come from `shared` only (stale values in locale rows are ignored).

### 3.2 `content/writes/split-locale.ts`

`splitLocale(keys, data)` → `{ shared, localized }`. Unit tests: split, empty localized, unlocalized entry keeps all in `shared`.

---

## Phase 4: Scope, options, hook arguments

- `cms/runtime/types.ts`: `Scope.locale?: string`, `Scope.fallback?: boolean`.
- `cms/api/local-api.ts`: `locale?`, `fallback?`, `alternates?` on read options; `locale?` on `WriteOptions`.
- `content/targets.ts` (or a new `content/locale.ts`): `withLocale(core, scope, options)` → the scope with `locale` (default `defaultLocale`) and `fallback`. Unknown locale: `ValidationError({ locale: "Unknown locale" })`. Without `localization`: a locale option throws the same error.
- Every `*.local.ts` of collections and globals passes its options through `withLocale()`. Nested calls inherit through `inner()` because it spreads the scope; an explicit option overrides.
- `content/lifecycle/hook-args.ts`: add `locale: s.locale`. `schema/hooks/` contracts: `locale?: string` on the hook args types.

Integration tests in a new `src/tests/locales.test.ts` with `localized()` in `setup.ts` (a `:memory:` instance with `locales: ["en", "de"]`, localized `posts` with a shared `hero` relation, an unlocalized `authors`, a localized global):

- an unknown locale is a 400 / `ValidationError`
- a hook sees `locale`; a nested `cms` call inside the hook inherits it

---

## Phase 5: Reads

### 5.1 SQL

`db/queries/document-sql.ts`:

- `selectDocs(db, collection, drafts, loc?)` where `loc = { locale, defaultLocale, fallback, keys }` for localized collections. LEFT JOIN `cms_document_locales` as `r` (requested) and `d` (default), each through `dataOf(drafts, "r.")`. Extra columns: `r_data`, `d_data`, `r_published_at`, `r_has_draft`, and `locales` (`json_group_array` subquery over visible rows).
- `visible()`: for localized collections, `r.published_at IS NOT NULL OR (fallback AND d.published_at IS NOT NULL)` in the published perspective.
- `jsonAt(path, drafts, loc?)`: for a key in `loc.keys`, `COALESCE(json_extract(r.data, …), json_extract(d.data, …))` (no `d` term without fallback).
- `db/types.ts`: `Row` gets the optional locale columns.

### 5.2 Mapping

`db/map-document.ts`: `toDoc(row, loc?)` merges with `mergeLocale()` when `loc` is given and adds `locale` and `locales`. `publishedAt` / `hasDraft` come from the requested row (falling back to the default row's when the requested one is missing).

### 5.3 Query leaves

Thread `loc` through `findDocs`, `loadDoc`, `loadByIds` (population), `joinedDocs`, and the global loaders (`loadGlobal` on `cms_global_locales`). `content/reads/read-documents.ts` and `read-global.ts` build `loc` from `core`, the scope and `localizedKeys()`.

### 5.4 Metadata

- `content/population/select-fields.ts` / `validate-select.ts`: `locale`, `locales`, `alternates` are metadata keys for localized collections.
- `http/strip-private-fields.ts`: no change expected; covered by a test.

Integration tests (`locales.test.ts`):

- read `de` returns the German title and the shared `hero`
- fallback on: a missing German title reads as English; fallback off: `null`
- published perspective: an English-only published post is visible in `de` with fallback, invisible without
- drafts perspective sees unpublished locale rows
- `where: { title }` matches the fallback value
- population reads targets in the scope's locale
- `locale` / `locales` metadata, and `select` of them
- unlocalized `authors` reads unchanged
- globals read per locale
- HTTP `?locale=de&fallback=false`; private localized fields stripped

---

## Phase 6: Writes

### 6.1 Store

`content/writes/helpers/store.ts` and the draft/document query leaves:

- `write()` loads the source merged for the scope's locale (fallback off), so hooks see shared plus this locale's fields.
- `storeDraft()` / `storeDocument()` split with `splitLocale()`: shared fields through the existing queries; localized fields through new upserts `saveLocaleDraft` / `saveLocale` in `db/queries/locales/` (`INSERT … ON CONFLICT (document_id, locale) DO UPDATE`). Same for globals.
- Insert creates the document row and the locale row in one transaction (the write already runs in one).

### 6.2 Publish and discard

- `publish-document.ts`: publishes the scope locale's row and the shared draft (`published_at` on both).
- `discard-draft.ts`: drops only the locale's draft, never the shared draft; a never-published locale row is deleted; a never-published document left without locale rows is deleted through the existing path (also for a document created in `de`).
- `discard-draft.ts` with `all: true`: drops the shared draft and every locale row's draft in one transaction (one `UPDATE` on the locale rows, then the existing shared discard); deletes never-published locale rows; a never-published document is deleted. `all` on the discard local wrappers, operations and endpoints (`?all=true`) of collections and globals.
- `remove-document.ts`: deletes the locale rows with the document.

Integration tests:

- draft save in `de` leaves `en` untouched; publish `de` publishes it
- a shared field saved as a draft in `de` is published by publishing `en`
- `required` applies to the published locale only
- create in `de`
- discard in `de` removes a never-published German row, keeps English
- discard in `de` keeps a pending shared draft; publishing `en` then publishes it
- discard with `all: true` reverts the shared draft and every locale's draft; deletes a never-published German row; deletes a never-published document; HTTP `?all=true`; globals
- discard of a never-published document created in `de` deletes the document
- delete removes all locale rows
- `drafts: false` collection saves per locale
- `afterChange` runs per locale save

---

## Phase 7: Integrity

- `content/integrity/check-unique.ts` + `value-taken.query.ts`: a localized key is checked against the merged values of all published documents in the scope's locale, fallback included (the `jsonAt()` with `loc` over a LEFT JOIN, so documents without a row in that locale count with their fallback value).
- `check-references.ts`, `existing-ids.query.ts`: unchanged (they check the IDs in the written data).
- `find-references.ts`, `referencing-documents.query.ts`, `referencing-global.query.ts`: for localized reference keys, also scan `cms_document_locales` / `cms_global_locales` (`data` and `draft`), and report the owner with its locale so effects write the right row.
- `apply-on-delete.ts`: `set-null` writes each affected locale row; `restrict` counts any locale; `cascade` unchanged.
- Media usage scans (where media deletion looks for references) include locale rows.
- `joined-documents.query.ts`: joins on a localized relation read through the locale rows.

Integration tests: a German-only reference to an author

- blocks the delete with `restrict`
- is nulled in the German row only with `set-null`
- cascades with `cascade`
- shows in a join from the author
- a localized image keeps its media from being reported unused
- `unique` slug: the same slug in `en` and `de` is allowed; twice in `de` is rejected; a German slug equal to the English slug of an untranslated document is rejected

---

## Phase 8: Copy and remove a locale

- `content/writes/copy-locale.ts`: in `run()`, read the localized keys of `from` (drafts, fallback off), save them as a draft in `to` (straight with `drafts: false`). Unknown or equal locales: `ValidationError`. Unlocalized entry: error.
- `content/writes/remove-locale.ts`: delete the row; the default locale or the last locale row is a `ValidationError`; runs `afterChange` with the document afterwards.
- Operations and local wrappers in `collections/operations/` and `globals/operations/` (`copy-locale.operation.ts`, `remove-locale.operation.ts`, `*.local.ts`), added to `LocalApi` and `create-local-api.ts`.
- Endpoints (protected): `collections/endpoints/copy-locale.endpoint.ts`, `remove-locale.endpoint.ts`, global equivalents; mounted in each `routes.ts`.

Integration tests: copy to a new locale; copy over an existing draft; the target's published version stays until publish; remove `de`; removing `en` refused; removing the only row of a document created in `de` refused; HTTP 401 without a session.

---

## Phase 9: URLs, `alternates`, schema state

### 9.1 Pure helpers

`helpers/locale-path.ts` (no imports), exported from the helpers barrel: `localeFromPath()`, `localizePath()`, `switchTarget()`. Unit tests: both prefix modes, unknown prefix stays in the path, `/de` alone, trailing slashes, `/`; `switchTarget()` with and without an alternate for the target.

### 9.1b Localization endpoint

- `schema/endpoints/localization.endpoint.ts`, next to the `/schema` endpoint: public `GET /localization` returning `core.localization` without anything else, or `null`. Mounted with the public reads in `http/app.ts`, before CSRF and session.
- Integration test: answers without a session; `null` without `localization`.

### 9.2 `permalink` with routing

- `preview/server/resolve-url.ts`: with `core.localization.routing`, `permalinkUrl()` and the `preview` default run through `localizePath()`; an explicit `preview` does not. Templates get `{locale}` from the `locale` metadata. Functions get `locale`.
- The preview-url endpoints read `?locale=`.

### 9.3 `alternates`

`content/reads/alternates.ts`: per locale, one batched read of the result's documents that are published in it (`id IN`, `populate: false`), then `permalinkUrl()` for each; add `"x-default"` when the default locale is published. Runs in `readDocs()` only with `alternates: true`, after `afterRead`. HTTP `?alternates=true` in `http/query/read-options.ts`.

Integration tests: a post with English and German slugs returns both URLs with the `de` prefix and `x-default`; an unpublished German version is not listed; no `x-default` without a published English version; no `permalink`, no `alternates`.

### 9.4 Schema state

`db/migrations/sync-localized.ts` (new): `syncLocalized(db, current)` where `current` maps `collection:<name>` / `global:<name>` to `localizedKeys()` or `null`. Compares with `cms_schema_state`, moves values (spec section 2, "Schema changes move data") in one transaction, logs with consola, writes the new state. `cms/runtime/create-runtime.ts` takes `current` and calls it after `migrate()`; `create-cms.ts` passes it.

Unit tests with a `tmpDb()` (`sync-localized.test.ts`): first run records only; shared to localized creates default rows with `published_at`; localized to shared keeps other locales' rows; switching back restores them; a whole collection on and off; drafts move too; a changed `defaultLocale` warns with a count (spy on `process.stderr.write`).

---

## Phase 10: Client and types

- `schema/inference/`: `Locale<C>` from the instance's `localization`; read options `locale`, `fallback`, `alternates`; write option `locale`; `locale`, `locales`, `alternates` on read types of localized collections only (respecting `select`). Keep `Wide` guards; check `tsdown` after changing read types (CLAUDE.md gotcha).
- `client/types/`: the same options and `copyLocale`, `removeLocale`, `copyGlobalLocale`, `removeGlobalLocale`, `localization` on `Client`; `all` on `discard` / `discardGlobal`; `localization()` memoizes its promise per client (unit test: two calls, one request); `client/create-client.ts` and `read-query.ts` (`locale`, `fallback`, `alternates` as query params; writes send `?locale=`).
- `inference.test.ts`: unknown locale rejected; `locale` is `never` without `localization`; metadata only on localized collections; `alternates` only with `alternates: true`.
- Integration: the existing client-driven tests read and write through `createClient()` with `locale`.

Verify: `pnpm typecheck` and `pnpm build:packages` (d.ts build).

---

## Phase 11: `seoMeta()`

`helpers/seo-meta.ts`: `alternates` result (`{ hreflang, href }[]`, absolute against `general.url`), `canonical` from `alternates[doc.locale]` when present. Unit tests in a new `seo-meta.test.ts` (or the existing one): with and without `alternates`, absolute URLs, `x-default`, canonical per locale.

---

## Phase 12: Preview runtime

- `preview/runtime/message.ts`: `saved` and draft messages get `locale?`.
- `preview/runtime/merge-draft.ts`: merge only when the reported data's `locale` matches or is missing. Test in `merge-draft.test.ts`.
- Admin bar Edit link (`preview/runtime/admin-bar.ts` `fillItems()`): add `?locale=` from the reported data. Test in `admin-bar.test.ts`.

---

## Phase 13: Admin

Run the admin playground (`pnpm dev:astro`) against the localized Astro example from phase 16, or add `localization` to it first.

- `packages/admin/src/shared/composables/useLocale.ts`: `localStorage` ref (vueuse `useStorage`, tolerant of a throwing storage), set from `?locale=`, `available` from `/schema`. Pure `localeLabel(code)` with `Intl.DisplayNames`, unit-tested.
- `shared/layouts/default.vue`: the language dropdown next to the perspective menu, same shape, hidden without `localization`.
- `modules/documents/composables/useAutosave.ts`: expose `flush()`; views call it before a locale switch.
- `DocPane.vue`, `GlobalEdit.vue`, `DocForm.vue`: load with `locale` and `fallback: false`; reload on locale change; pass `locale` on save, publish, discard.
- `DocPane.vue`, `GlobalEdit.vue`: outside the default locale, also read the default locale (`populate: false`, drafts) for the placeholders; reload it with the form.
- `FieldInput.vue`: default-locale value as placeholder for empty localized inputs; "Same in all languages" marker on shared fields (uses `localized` from `/schema`).
- `StatusBadges.vue`: active locale state (Draft when the locale row has a draft or the shared draft is pending) plus locale codes with dots; a click sets the locale. Pure status helper unit-tested.
- Header "…" menu: "Copy from…", "Copy to…", "Remove translation", "Discard all changes" with `alert-dialog` confirms (wording in spec section 5). "Discard all changes" shows only when the shared draft or another locale's draft is pending; the pure status helper also returns that.
- `CollectionList.vue`: read with `locale`; "Not translated" marker.
- `modules/preview/`: `previewUrl()` with `locale`; messages carry `locale`.
- `pnpm --filter @tenoncms/admin test` and a manual pass in a foreground tab: switch languages with a pending edit, copy both ways with the confirm, remove, publish per locale.

---

## Phase 14: Adapters

- `integrations/astro/middleware.ts`: with `routing`, `locals.locale` and `locals.path` from `localeFromPath()`; types in the injected `App.Locals`.
- `integrations/nuxt/runtime/composables.ts`: `useLocale()` (`locales`, `defaultLocale`, `locale`, `path`, `localePath()`, `switchLocale()`), `useAlternates()`; `useTenon()` reads default to `locale.value`. `useLocale()` loads the config with `useAsyncData("tenon:localization", () => client.localization())`, so SSR fetches it in-process and the browser takes it from the payload; `switchLocale()` is `navigateTo(switchTarget(…))`.
- Register the new auto-imports in `integrations/nuxt/index.ts`.
- `nuxt typecheck` in `examples/nuxt`.

---

## Phase 15: Redirects plugin

`packages/plugins/src/redirects/index.ts`: `locale` text field; `afterChange` stores the hook's `locale` only for localized collections, and scopes the chain update and the `from` lookup to it; `resolveRedirect(cms, path, locale?)` matches that locale or none; `GET /lookup?path=&locale=`. Tests in the plugin's test file: a German path change creates a German redirect; a path change in an unlocalized collection creates one without a locale, found by a lookup without a locale; lookup with a locale also finds redirects without one.

`packages/core/src/presets/nested-paths.ts`: `updateChildPaths` re-saves only children with a row in the hook's locale. Test in `locales.test.ts`: changing a parent's German path leaves an untranslated child without a German row.

---

## Phase 16: Astro example and docs

- `examples/astro/tenon.config.ts`: `localization: { locales: ["en", "de"], defaultLocale: "en" }`; `pages` and `posts` localized; `posts.hero` `localized: false`.
- `[...path].astro` and `posts/[slug].astro`: read with `locals.locale` / `locals.path`, `alternates: true`; `<html lang>`; a language switch from `alternates`; `hreflang` from `seoMeta()`. The prerendered post page builds paths per locale in `getStaticPaths()`.
- README "Localization" section; module READMEs (`content/`, `db/`, `preview/`, `helpers/`, `cms/`); CLAUDE.md (architecture lines for the new leaves, the Astro example, `permalink`).

Smoke test (isolated DB and uploads dir, per the memory note): sign up, create a post in `en`, save and publish a German version over `?locale=de`, then `curl $B/de/posts/<de-slug>` shows the German title and an `hreflang` link to the English URL.

---

## Final check

`pnpm lint`, `pnpm fmt:check`, `pnpm test`, `pnpm typecheck`, `pnpm build`.
