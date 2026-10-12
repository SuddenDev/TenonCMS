# Content localization

Status: design approved in brainstorming, 2026-10-12. Sub-project A of internationalization. Sub-project B (admin UI strings and static site strings, both message files with `t()`) gets its own spec and builds on the locale codes and `useLocale()` defined here.

## Goal

Editors write a document in several languages. Fields are localized per collection, with an opt-out per field. Each locale has its own draft and publish state. Shared fields are stored once. Reads take a locale and fall back to the default locale. Hosts get URL helpers, `hreflang` and a language switch without an extra route component.

The model follows Payload: one document ID, shared fields on the document, localized fields per locale (Payload's Postgres `_locales` table), status per locale (Payload's localized `_status`). The default is inverted: in a localized collection, fields are localized unless they set `localized: false`.

## 1. Config

```ts
defineCms({
  localization: {
    locales: ["en", "de"],
    defaultLocale: "en",
    // Default true. A missing value or locale reads as the default locale's.
    fallback: true,
    // Default { prefix: "except-default" }. `false`: the host routes on its own.
    routing: { prefix: "except-default" }, // or "always"
  },
  collections: {
    posts: defineCollection({
      localized: true,
      fields: {
        title: { type: "text" },
        hero: { type: "image", localized: false },
      },
    }),
  },
});
```

- `localized` on a collection or global: default `false`.
- `localized: false` on a field: opts a field of a localized collection or global out. The field is then shared.
- `localized` on a group applies to the whole group. A child of a localized group MUST NOT set `localized`.
- Relation, image and file fields MAY be localized.
- The `media` collection MUST NOT be localized.
- With `localization` set, the default `general` and `seo` globals are localized.
- The admin labels locales with `Intl.DisplayNames`. The config has no labels.

`checkSchema()` throws at startup for:

- `localized` on a collection or global without `localization`.
- `localized` on a field outside a localized collection or global.
- `localized` on a child of a localized group.
- A localized `media` collection.
- A `defaultLocale` that is not in `locales`, an empty `locales`, or duplicate locales.

## 2. Storage

Migration `005_cms_locales`:

```
cms_document_locales  document_id, locale, data, draft, created_at, updated_at, published_at
                      PRIMARY KEY (document_id, locale)
cms_global_locales    name, locale, data, draft, created_at, updated_at, published_at
                      PRIMARY KEY (name, locale)
cms_schema_state      kind ('collection' | 'global'), name, localized (JSON array of field paths, or NULL when off)
                      PRIMARY KEY (kind, name)
```

- Unlocalized collections and globals keep everything in `cms_documents` / `cms_globals`, as now. They have no locale rows.
- Localized ones keep shared fields in `cms_documents.data` / `draft` (or `cms_globals`) and localized fields in the locale row's `data` / `draft`.
- A locale row is published when its `published_at` is set. `cms_documents.published_at` tracks the shared fields.
- Deleting a document deletes its locale rows in the same transaction.
- A locale removed from `locales` keeps its rows. Reads ignore them.

### Schema changes move data

On first DB access, after the migrations, `migrate.ts` compares the localized field sets in `cms_schema_state` with the config. It moves the data in one transaction, for both `data` and `draft`, then stores the new sets.

- Shared to localized (a field, or a whole collection turned on): the value moves into the default locale's row. A missing row is created with the document's `published_at`.
- Localized to shared (a field, or a collection turned off): the default locale's value moves into the shared data.
- Other locales keep their rows and values. Reads ignore values of fields that are not localized. Switching back restores them. A config change never deletes a translation.
- Each move is logged with consola: `moved posts.title to locale rows (12 documents)`.
- The first run with an empty `cms_schema_state` only records the current sets; nothing moves.
- A changed `defaultLocale` moves nothing. Documents without a row in the new default locale are counted and logged as a warning.

## 3. Reads

- Every read takes `locale?: Locale` (HTTP `?locale=`) and `fallback?: boolean` (HTTP `?fallback=`). `locale` defaults to `defaultLocale`, `fallback` to the config.
- An unknown locale throws `ValidationError` (400). Unlocalized collections ignore `locale`. Without `localization`, the option has type `never`.
- `Scope` gets `locale`. Hooks, nested `cms` calls and population inherit it. Every hook argument gets `locale`.
- `selectDocs()` LEFT JOINs the requested locale row and the default locale row, each through `dataOf()` of the perspective. `Row` gets both data columns.
- Visibility in the published perspective: the requested row is published, or `fallback` is on and the default row is published. The drafts perspective sees every document.
- `content/reads/merge-locale.ts` (on `eachField()`): shared fields from the document row; localized fields from the requested row, then the default row when `fallback` is on, then `null`. A localized value stored as `null` falls back too, as in Payload.
- Filters on localized fields use the same fallback, through a locale-aware `jsonAt()` in `document-sql.ts`: `COALESCE(json_extract(<requested>, path), json_extract(<default>, path))`. A filter matches the value a read returns.
- Population reads targets in the scope's locale.
- Metadata on localized collections only, under the existing `select` rules for metadata:
  - `locale`: the locale the read is in.
  - `locales`: the published locales; in the drafts perspective, every locale with a row.
  - `alternates` (only with the read option `alternates: true`): `{ [locale]: url, "x-default": url }` for the published locales. Each URL is the document read in that locale, resolved through the collection's `permalink` (section 6), then through `localizePath()` when `routing` is set. `x-default` is the default locale's URL; it is omitted when the default locale has no published version. A collection without `permalink` gets no `alternates`. It costs one read per locale.
- Private fields are stripped from HTTP responses as now, merged fields included.

## 4. Writes

- Every write takes `locale?: Locale` (HTTP `?locale=`), default `defaultLocale`.
- The pipeline runs on the merged document (shared fields plus this locale's fields): defaults, slugs, hooks, parsing and validation see the whole document.
- The save step splits the data with `content/writes/split-locale.ts` (on `eachField()`): shared fields to the document row, localized fields to the scope locale's row (upsert).
- Draft save writes the locale row's `draft` and the shared `draft`.
- Publish runs the full pipeline over the merged pending data, then publishes the locale row and the shared draft. A publish in any locale publishes the pending shared fields. `required` is therefore checked for the published locale only.
- Discard drops only the locale's draft. The shared draft stays until a publish in any locale, because it may hold edits made in another locale. A locale that was never published loses its row. A never-published document left without locale rows is deleted, as now (a document can be created in any locale, so this is not tied to the default locale).
- Discard with `all: true` (HTTP `?all=true`) drops the shared draft and the draft of every locale, so the whole document returns to its published state. Never-published locale rows are deleted; a never-published document is deleted. It ignores `locale`. Same for globals.
- A document can be created in any locale.
- `drafts: false` collections save straight to `data` / `published_at` per locale.

### Integrity

- `checkUnique()`: a localized field is unique among the merged values of all published documents in the same locale, fallback included (a document without a row in that locale counts with its fallback value); a shared field among `cms_documents`, as now.
- Reference checks, reverse lookups (`findReferences()`, joins) and `applyOnDelete()` also scan locale rows for localized relation, image and file fields. `set-null` updates every locale row that holds the ID. `restrict` counts references in any locale. Media usage scans include locale rows.

### New operations

On the local API, over HTTP and in the client, for collections and globals:

- `copyLocale(collection, id, { from, to })` / `copyGlobalLocale(name, { from, to })`: reads the localized fields of `from` without fallback in the drafts perspective and saves them as a draft in `to` (straight to `data` with `drafts: false`), overwriting `to`'s pending draft. One transaction, normal hooks. HTTP: `POST /collections/:name/:id/locales/:to/copy` with `{ from }`, `POST /globals/:name/locales/:to/copy`.
- `removeLocale(collection, id, locale)` / `removeGlobalLocale(name, locale)`: deletes one locale row. The default locale and the document's last locale row MUST NOT be removed (`ValidationError`). Runs `afterChange` with the document as it is afterwards. HTTP: `DELETE /collections/:name/:id/locales/:locale`, `DELETE /globals/:name/locales/:locale`.

## 5. Admin

`/schema` sends `localization: { locales, defaultLocale }` when it is set.

### Language menu

- A dropdown in the app bar next to the perspective menu, same `Button` + `DropdownMenuRadioGroup` shape. The button shows the code (`EN`); items show the native name from `Intl.DisplayNames` and mark the default locale.
- Shown only when `/schema` has `localization`.
- `useLocale()` in `shared/composables/`: a ref in `localStorage` (vueuse `useStorage`; reads and writes MUST tolerate a throwing storage). No cookie, no reload: only the admin's requests use it. An admin URL with `?locale=` sets it.
- Views watch it and load again. Before a switch, the open form's pending autosave is flushed.
- Unlocalized collections and globals ignore it.

### Document and global views

- The form loads the active locale with `fallback: false`. An empty localized field shows the default locale's value as a muted placeholder.
- Shared fields show a marker with the tooltip "Same in all languages".
- `StatusBadges.vue` shows the active locale's state (Published, Draft, Not translated); Draft means the locale row has a draft or the shared draft is pending, since a publish would publish both. It also shows a row of locale codes with status dots. A click on a code switches the language menu.
- Without a row in the active locale, the form opens empty with placeholders; the first autosave creates the row.
- The header's "…" menu gets:
  - "Copy from…": a submenu of the other locales; fills the active locale.
  - "Copy to…": a submenu of the other locales; fills the chosen one from the active one.
  - "Remove translation": not for the default locale; switches to the default locale afterwards.
  - "Discard all changes": only when something besides the active locale's draft is pending (the shared draft or another locale's draft).
- Every action confirms with the shadcn `alert-dialog`:
  - Copy to an existing locale: "Overwrite German? Its draft will be replaced with the English content." Destructive "Overwrite" button.
  - Copy to a new locale: "Create German from English?" with "Create".
  - Remove: "Remove the German translation?" Destructive "Remove" button.
  - Discard all: "Discard all changes? Shared fields and the German and French drafts go back to the published version." Lists the pending parts. Destructive "Discard" button.
- After a copy into the active locale, the form loads again.

### Lists

- `CollectionList.vue` reads in the active locale with fallback, so every row has a title; its client-side search and sort use the merged values. A row without a version in the active locale gets a muted "Not translated" marker next to the draft dot.

### Preview

- `client.previewUrl()` passes the active locale. Live preview messages (`saved` and draft changes) carry `locale`.
- The admin bar's Edit link adds `?locale=` from the reported data's `locale`.

## 6. Site helpers

### Pure helpers

`helpers/locale-path.ts`, no imports, exported from `.` and `./client`:

- `localeFromPath(path, localization)`: `/de/about` → `{ locale: "de", path: "/about" }`. A prefix that is not a locale is part of the path. With `prefix: "except-default"`, an unprefixed path is the default locale.
- `localizePath(path, locale, localization)`: `/about`, `de` → `/de/about`; the default locale stays unprefixed with `except-default`.
- `switchTarget(localization, path, locale, alternates?)`: `alternates[locale]` when present, else `localizePath()` of the unprefixed current path. The framework-free part of every language switch.

### Localization endpoint

- Public `GET /api/cms/localization` returns `{ locales, defaultLocale, fallback, routing }`, or `null` without `localization`. It holds no secret, so it needs no session. `/schema` stays protected.
- `client.localization()` fetches it once per client and caches the promise. Every framework helper builds on it plus the pure helpers.
- The browser MUST NOT import `#integral/config` for it: the config pulls in server code.

### `permalink`

A new option on collections and globals, independent of localization:

```ts
posts: defineCollection({
  // Template of the document's public URL. The host's routes MUST serve it.
  permalink: "/posts/{slug}",
  // Optional. Default: `permalink`. Set it only when the iframe shows another page.
  preview: "/preview/posts/{id}",
});
```

- Same forms and rules as `preview` today: a template with placeholders (groups and at most one non-many relation), or a function `(doc, { cms, locale }) => string | null`, the signature `preview` functions have, which also get `locale`. `checkSchema()` checks its placeholders like `preview`'s; the preview template code moves to a shared leaf both use.
- `preview` defaults to `permalink`. `/schema` reports `preview: true` when either is set.
- `alternates`, `hreflang` and `switchLocale()` use `permalink` only. A `preview` that differs is never used for them.
- With `routing`, templates stay locale-free (`/posts/{slug}`, `{path}`); the CMS runs the resolved `permalink` through `localizePath()`, and the `preview` default too. An explicit `preview` is used as it is.
- With `routing: false`, templates MAY use `{locale}`, filled from the `locale` metadata.
- The `page` preset's `page.preview` becomes `page.permalink` (`"{path}"`); the examples set `permalink: page.permalink` on `pages` and `permalink: "/posts/{slug}"` on `posts` instead of `preview`.
- `merge-draft.ts` merges a draft only into reported data with the same `locale`, or without one.

### `seoMeta()`

- New result `alternates: { hreflang, href }[]` from `doc.alternates`, absolute against `general.url`. Empty without `doc.alternates`.
- `canonical`: `alternates[doc.locale]` when present, else `path`, as now.

### Adapters

- Astro: the middleware sets `locals.locale` and `locals.path` (prefix removed) with `localeFromPath()`. The catch-all reads `{ where: { path: Astro.locals.path }, locale: Astro.locals.locale, alternates: true }`. No `[lang]` route folder.
- Nuxt: auto-imported `useLocale()` loads the config with `useAsyncData("integral:localization", () => client.localization())` (in-process during SSR, then from the payload, so the browser does not fetch it again) and returns `{ locales, defaultLocale, locale, path, localePath(path, locale?), switchLocale(locale) }`; `locale` and `path` are computed from the route with `localeFromPath()`. `useAlternates(() => page.value?.alternates)` registers the page's alternates. `switchLocale()` is `navigateTo(switchTarget(…))`. `useIntegral()` reads default to `locale.value`.
- TanStack Start, standalone and other sites: `client.localization()` plus the pure helpers.

## 7. Plugins

- `redirects`: the collection gets a plain `locale` text field (not `localized: true`, so it works without `localization`). The root `afterChange` stores the hook's `locale` only when the changed collection is localized; the hook gets the default locale for unlocalized collections too, and storing it would hide those redirects from a lookup without a locale. Following existing redirects (`where: { to: from }`) and the `from` lookup match the same locale. `from` is stored without a locale prefix. `resolveRedirect(cms, path, locale?)` and `GET /lookup?path=&locale=` match `from` with that `locale` or with none; without a locale they match redirects without one.
- `nestedPaths()`: `uniquePath` compares merged values, so a page cannot claim a path where an untranslated page already serves fallback content. `updateChildPaths` MUST only re-save children with a row in the hook's locale: its `find` runs with fallback and returns every child, and `update` in a locale without a row creates one, which would add an empty translation to every untranslated child.

## 8. Client and types

- `Locale`: the union of `localization.locales`; `never` without `localization`.
- Read options `locale`, `fallback`, `alternates`; write option `locale`.
- `locale`, `locales` and `alternates` in the read types of localized collections only.
- `copyLocale()`, `removeLocale()`, `copyGlobalLocale()`, `removeGlobalLocale()`.
- `discard()` and `discardGlobal()` take `{ all: true }`.
- `localization()`: the cached localization config, typed with the instance's `Locale`.
- The Nuxt composable passes the options on, as now.

## 9. Examples and docs

- `examples/astro`: `localization: { locales: ["en", "de"], defaultLocale: "en" }`, `pages` and `posts` localized, `posts.hero` with `localized: false`, the catch-all reading `locals.locale` / `locals.path`, `<html lang>` from the locale, a language switch from `alternates`, `hreflang` from `seoMeta()`.
- The other examples stay unlocalized.
- README: a "Localization" section. Module READMEs: `content/`, `db/`, `preview/`, `helpers/`. CLAUDE.md.

## 10. Testing

TDD, red first.

- Unit: `merge-locale.test.ts`, `split-locale.test.ts`, `locale-path.test.ts`, `permalink` resolution and the `preview` default, `seo-meta` `hreflang` and `canonical`, `checkSchema()` rules, the schema-state diff.
- Type tests in `inference.test.ts`: unknown locales rejected, `locale` is `never` without config, metadata only on localized collections.
- Integration, `src/tests/locales.test.ts` with its own schema in `setup.ts`:
  - drafts, saves and publish per locale; shared fields published from any locale
  - fallback on and off; published visibility
  - `required` per published locale
  - `unique` per locale
  - filters with fallback
  - population in the locale
  - localized relations in reference checks, joins and `onDelete` (restrict, set-null, cascade)
  - copy (new and overwrite) and remove (default refused)
  - `locale` in hook arguments; nested calls inherit it
  - `alternates`
  - globals
  - HTTP `?locale=`, `?fallback=`, private fields stripped
  - schema changes: field and collection on and off, other locales kept, `defaultLocale` change warning
- Plugins: redirects per locale.
- Admin: Vitest for pure helpers (locale label, status). The UI is checked by hand in the Astro example.
- Smoke test: curl `?locale=de` against the Astro example.

## Out of scope

- Admin UI strings and static site strings (sub-project B, own spec).
- Side-by-side editing, machine translation.
- Localized media (`alt` per locale).
- `Accept-Language` detection, a locale cookie on the site, sitemaps with alternates.
- `dir` for right-to-left locales.
