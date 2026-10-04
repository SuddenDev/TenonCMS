# Live preview (Presentation mode)

A Sanity-Studio-like editing experience: the document form next to a live render of the site, with
desktop and mobile frames, click-to-edit, and updates on every keystroke without saving.

Plan 2 (`2026-10-04-drafts-design.md`) adds drafts, autosave, publish and the Astro re-render path.
Nothing in this plan depends on it.

## How it updates

Two layers, both fed by the admin, neither touching the server:

- **A. DOM patching.** The site marks elements with `data-cms="<collection>:<id>:<path>"`. A small
  runtime in the page patches their text (or listed attributes) with the admin's unsaved form state.
  Works on every page, Astro included, prerendered or not.
- **B. Data re-render.** Vue and React pages hold the document in a client-side store; a hook
  merges the unsaved form state into it, so the component tree re-renders and structural changes
  show (list items, conditions). Astro has no client data layer; its re-render path is plan 2.

The admin and the site share one origin, so the channel is a `BroadcastChannel`. An iframe and a
tab opened with "Open in new tab" are the same case: both receive the broadcasts.

## Host contract

### `preview` on collections and globals

```ts
preview?: string | ((doc: Record<string, unknown>, ctx: { cms: LocalApi }) => string | null | Promise<string | null>)
```

- A template string with `{dot.path}` placeholders: `'/posts/{slug}'`, `'/{category.slug}/{slug}'`.
  A placeholder resolves through groups and one relation hop (the relation's target is read with
  `findById`). The pages preset sets `preview: '{path}'`. Globals usually set `'/'`.
- A function gets the document as the admin holds it (unsaved form state) and the local API. `null`
  means "no preview for this document".
- `checkSchema()` rejects a template placeholder that names no stored field.
- `/schema` sends `preview: true` for either form, nothing else. The admin never resolves URLs.

### `POST /api/cms/collections/:name/preview-url` and `POST /api/cms/globals/:name/preview-url`

Session-gated (under `writes`). Body: the form state. Response: `{ url: string | null }`.
404 when the collection or global has no `preview`. The URL is relative to the site origin.
The client gets `client.previewUrl(collection, data)` and `client.previewGlobalUrl(name, data)`.

Core: `src/preview/` (`README.md`, `index.ts` export barrel for the browser entry, `template.ts`:
`placeholders()`, `resolve()`; `url.ts`: `previewUrl(core, name, data)` used by the route). The
template functions have no imports, like `helpers/`.

### `integral-cms/preview` (browser, framework-free)

New tsdown entry `src/preview/index.ts`. No code runs at import time (Nitro bundles it).

- `edit(collection: string, id: string | null, path: string): string` returns the `data-cms`
  value: `pages:abc:seo.title`. `id === null` means a global: `general::title`. Templates write
  `data-cms={edit('pages', page.id, 'title')}`.
- `data-cms-attr="src,alt"` on a bound element patches those attributes instead of the text. The
  path then points into the pushed value (`hero.src`), because the admin pushes image and file
  fields as the media document.
- `preview(options?: { morph?: boolean }): Unsubscribe` starts the runtime, idempotent. It returns
  without doing anything unless `window.name` starts with `integral-preview` (the admin names its
  iframe and the tabs it opens that way; `window.name` survives navigation, a query param would
  not). `morph` is plan 2.
- `subscribe(cb: (drafts: Drafts) => void): Unsubscribe`, `Drafts = Record<'<collection>:<id>', Record<string, unknown>>`,
  globals keyed `name:`. An external store: `getDrafts()` returns the current snapshot.
- `merge(collection, doc, drafts)` applies the draft of `doc.id` to `doc`: draft values replace
  top-level keys. A draft value that is an id or a list of ids whose ids equal the ids of the
  current value's documents keeps the current value, because the browser cannot populate.

The runtime, when active:

- Joins `BroadcastChannel('integral-cms:preview')`.
- On `{ type: 'draft', collection, id, data }` (`id` is `''` for a global): stores it, notifies
  subscribers, patches every `[data-cms]` element whose key matches: `textContent` for a string or
  number, the attributes listed in `data-cms-attr` otherwise. Objects and arrays are left alone
  (layer B). A `MutationObserver` re-patches elements that a framework re-render replaces.
- On `{ type: 'mode', edit: boolean }`: sets `data-cms-edit` on `<html>`. One injected stylesheet
  outlines `[data-cms]:hover` while that attribute is set. A click on a bound element in edit mode
  is prevented and posted as `{ type: 'edit', collection, id, path }`.
- Posts `{ type: 'url', href }` on start, so the admin's URL field follows navigation.

### `integral-cms/preview/vue`

`useDraft(collection: string, doc: MaybeRef<T>): ShallowRef<T>`: `merge()` under `subscribe`,
starts the runtime. `useIntegral()` (Nuxt) wraps the data of `find`, `findOne`, `findById` and
`getGlobal` with it, so Nuxt pages need no code change. The Nuxt module adds a client plugin that
calls `preview()`.

### `integral-cms/preview/react`

`useDraft(collection: string, doc: T): T` on `useSyncExternalStore`, same `merge()`. TanStack and
plain Vite hosts call `preview()` once in their root component; `integralAdmin()` cannot inject
into pages.

### Astro

The integration injects `import { preview } from 'integral-cms/preview'; preview()` on every page
(`injectScript('page', …)`) unless `preview: false`. Templates use `edit()`. Only layer A applies
until plan 2.

## Admin

New module `src/modules/preview/`.

- Routes `/preview/collections/:name/:id` and `/preview/globals/:name` (`meta.panes`). Panes, left
  to right: the menu pane, `PreviewPane` (`grow`, `min` 640), the document pane (`min` 480, `max`
  800, resizable), then `?ref=` panes as in `DocEdit.vue`. `DocPane.vue` and `GlobalEdit.vue` take
  `min` / `max` / `grow` props instead of the hard-coded `448`.
- `DocPane.vue` (and the global view) show an eye button in the header when the schema entry has
  `preview`. It leads to the preview route. In the preview route the pane shows no eye button; the
  preview pane's close button leads back to `/collections/:name/:id` or `/settings/globals/:name`.
- `PreviewPane.vue` header, left to right: edit-mode toggle (`Switch`, default on), reload, the URL
  (read-only input showing what the runtime last reported), open in new tab
  (`window.open(href, 'integral-preview-<key>')`), desktop / mobile toggle, close. Body: the iframe
  (`name="integral-preview"`), full size on desktop, a 390 px wide frame centered on `bg-muted` on
  mobile. "No preview for this document" when the URL is `null`.
- The iframe `src` is fetched through `client.previewUrl()` on mount, when the document changes and
  on reload. Typing never changes the `src`.
- `DocForm.vue` emits `change` with the normalized form state (`normalize(fields, data, true)`) on
  every edit. The preview route broadcasts `{ type: 'draft', collection, id, data }` through the
  same `BroadcastChannel`, debounced 50 ms. Image and file ids are replaced by their media document
  (`client.findById('media', id)`, cached per pane), `many` ones as arrays.
- Click-to-edit: on `{ type: 'edit' }` the route switches the document pane to that document when
  it differs (`router.push`), then focuses the field: a `focusKey` provide/inject carries the path,
  `FieldInput.vue` scrolls its input into view and focuses it when the path matches.
- The mode toggle broadcasts `{ type: 'mode', edit }` on change and when the runtime reports a
  `url` (a fresh page needs the current mode).

## Testing

- Unit (core): `preview/template.test.ts` (`placeholders()`, `resolve()` with groups, missing
  values and a relation hop), `preview/index.test.ts` (`edit()`, `merge()`, the id-list rule).
- Integration (core, `src/tests/preview.test.ts`): `checkSchema()` rejects a bad placeholder; the
  `preview-url` routes resolve a template, call a function (with `cms`), return `null`, 404
  without `preview`, 401 without a session.
- The DOM runtime and the admin have no browser test harness here: verify in the examples. Each
  example's catch-all page and post page get `edit()` on title and body.

## Out of scope

Astro re-render (plan 2), overlays beyond the hover outline, a Sanity-style "Vision" tool,
cross-origin admin (would need `postMessage`).
