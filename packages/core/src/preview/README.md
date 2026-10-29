# preview

Live preview and the admin bar. The admin shows the site next to the form and pushes unsaved form state into it with
`postMessage`. The site patches bound elements, reports the documents it shows, and sends edit clicks back. Signed-in
editors get the admin bar on the site, with links into the admin. Nothing here touches the
database except `server/resolve-url.ts`, which reads through the [local API](../cms/README.md). The preview cookie is
read in [`auth/get-caller.ts`](../auth/get-caller.ts).

The admin resolves relative preview URLs against the `site` option of `defineCms()` (default: its own origin). The
page talks only to its `parent` (the admin's iframe) or `opener` (a tab the admin opened), and only after that window
sent a first message from the origin of the `admin` option (a path for the site's own origin, or a full URL like
`https://cms.example.com/admin`); it posts only to that origin. The admin accepts and posts only to the site's origin.
On another origin, drafts reach the page through messages, but the drafts perspective needs the preview cookie, so a
server render shows drafts only when the site shares the admin's cookies (same site).

## Follow a live preview

`preview()` in the admin's iframe flows through:

`runtime/preview.ts` → `runtime/live.ts` → `runtime/store.ts` → `runtime/bind-elements.ts`

`preview()` picks the mode from `window.name` and loads `live.ts` (with idiomorph) on demand. `startLive()` opens the channel to the admin (`openChannel()`), which
connects on the admin's first message. A `draft` message goes to `setDraft()`, which notifies `useDraft()`
subscribers, and `patchAll()` writes the new values into bound elements. A `MutationObserver` patches again after a
framework re-render and reports the bound documents. With `morph`, a `saved` message runs `createRerender()`.

## Follow the admin bar

`preview()` on a site page flows through:

`runtime/preview.ts` → `runtime/admin-bar.ts` → `GET /_tenon/admin-bar` (`endpoints/admin-bar.endpoint.ts` →
`config/admin-bar.ts`) → `import("tenoncms/admin/bar")` → `mountAdminBar()`

`preview()` starts the bar when `admin` is not `false`, the page is not under the admin's path, and the
`tenon-session` hint cookie is set (`hasSessionHint()`). `startAdminBar()` asks the endpoint for the page's items
(`loadAdminBar()`, with the page `url` and the `mode`). The endpoint composes the built-in stubs (`builtIns()`) with the
registered items from `admin.adminBar.items`, drops hidden ones, runs the loaders of the others and answers
`{ position, items, branding }`. The endpoint sorts the items, and `fillItems()` turns the built-in stubs into links for the page. A `clientRef()` on an item (`onClick`, `mount`) resolves through the
`#tenon/client-registry` module, imported on the first item that needs it and only after the session check. The bar
chunk loads only then, so visitors download nothing extra. It mounts into an open shadow root on a
`<div data-cms-bar>` on `<html>`. The bar renders the context and calls its actions; the runtime owns all state and
calls `update()` when the bound documents, the edit mode or an item's data change.

The framework-specific `useDraft()` helpers live in [`integrations/vue/preview.ts`](../integrations/vue/preview.ts) and [`integrations/react/preview.ts`](../integrations/react/preview.ts). Their public imports remain `tenoncms/preview/vue` and `tenoncms/preview/react`.

## Files

| Path                              | Responsibility                                                                                                                                                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                        | Browser-safe public exports.                                                                                                                                                                                                                                                |
| `config/types.ts`                 | `Preview`, `Drafts`, `PreviewMessage`, `PreviewOptions` and `Unsubscribe`.                                                                                                                                                                                                  |
| `config/admin-bar.ts`             | `ADMIN_BAR_POSITIONS` and `checkAdminBarPosition()`.                                                                                                                                                                                                                        |
| `endpoints/`                      | `POST /preview` sets the preview cookie, `DELETE /preview` clears it.                                                                                                                                                                                                       |
| `endpoints/admin-bar.endpoint.ts` | `GET /admin-bar?url=&mode=`: the page's `{ position, items, branding }`. Protected.                                                                                                                                                                                         |
| `server/resolve-url.ts`           | `previewUrl()` (`preview`, else `permalink`) and `permalinkUrl()`: run the host's function, or fill a template after one relation hop. With `routing`, the `permalink` result gets the locale prefix; without it, `{locale}` is filled. `urlLocale()` validates `?locale=`. |
| `templates/placeholders.ts`       | `PLACEHOLDER` and `placeholders()`: the dot paths of a template.                                                                                                                                                                                                            |
| `templates/resolve-template.ts`   | `resolveTemplate()`: fills a template, or `null` when a value is missing.                                                                                                                                                                                                   |
| `runtime/message.ts`              | Message-shape validation shared by the site and admin.                                                                                                                                                                                                                      |
| `runtime/preview.ts`              | `preview()`: picks the mode and loads `live.ts` only when needed.                                                                                                                                                                                                           |
| `runtime/live.ts`                 | `startLive()`: message channel and origin checks, observer, edit clicks and morph re-renders.                                                                                                                                                                               |
| `runtime/store.ts`                | The singleton draft snapshot, `draftKey()` and subscriptions.                                                                                                                                                                                                               |
| `runtime/merge-draft.ts`          | `merge()`: applies a draft recursively, items by `id`, keeping populated values whose ids match.                                                                                                                                                                            |
| `runtime/bind-elements.ts`        | `edit()`, `parseBinding()`, DOM patches, highlights, `boundDocuments()`, and `excludedSelector()` / `pickBound()` for excluded entries.                                                                                                                                     |
| `runtime/admin-bar.ts`            | `startAdminBar()`: loads the items, mounts the bar in a shadow root, `fillItems()`.                                                                                                                                                                                         |
| `runtime/admin-bar-items.ts`      | `builtIns()` and `composeItems()`: built-in stubs and server-side composition.                                                                                                                                                                                              |
| `runtime/site-api.ts`             | The site's calls and cookies: session hint, `loadAdminBar()`, `perspective()`, `setPerspective()`.                                                                                                                                                                          |

`index.ts` and the Vue/React helpers in `integrations/` run in the browser and in server bundles. They MUST NOT import zod or core
runtime code. `runtime/` imports only types from `admin/index.d.ts` and loads the bar with a dynamic
`import("tenoncms/admin/bar")`, which the host's bundler splits into its own chunk. Files in `templates/` MUST import
only from each other.

## Messages

| Message                                            | From  | What it does                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ type: 'ready' }`                                | site  | Sent to `"*"` when the runtime starts. The admin answers with `mode` and the current draft.                                                                                                                                                                                                  |
| `{ type: 'draft', collection, id, data, locale? }` | admin | The form state of a document. `id` is `''` for a global. Stored by `<collection>:<id>`. `locale`: the language of a localized document.                                                                                                                                                      |
| `{ type: 'mode', edit, exclude? }`                 | admin | Sets or removes `data-cms-edit` on `<html>`. In edit mode, bound elements outline on hover. `exclude` names the collections and globals with `visualEditing: false`: their elements get no outline, and a click goes to the bound element around them (`excludedSelector()`, `pickBound()`). |
| `{ type: 'highlight', collection, id }`            | admin | Marks the elements of that document with `data-cms-highlight` (outlined); `collection: null` clears it.                                                                                                                                                                                      |
| `{ type: 'edit', collection, id, path }`           | site  | A click on a bound element in edit mode. The admin focuses that field.                                                                                                                                                                                                                       |
| `{ type: 'url', href }`                            | site  | Sent after the admin's first message, so the admin knows the current page.                                                                                                                                                                                                                   |
| `{ type: 'documents', documents }`                 | site  | `{ collection, id }` of every bound document, once each, in page order. Sent after the admin's first message and on every DOM change that changes the list. The admin lists them as "On this page".                                                                                          |
| `{ type: 'saved', collection, id, locale? }`       | admin | A draft save. With `morph`, the page re-renders from the server; otherwise ignored.                                                                                                                                                                                                          |

## Locales

URLs come from two options. `permalink` is the public URL of a document, `preview` the page the admin's frame shows; `preview` defaults to `permalink`, and `/schema` reports `preview: true` when either is set. `permalinkUrl()` is `alternates`, `hreflang` and the language switch; it never uses a `preview` that differs. A function gets `(doc, { cms, locale })`. A template fills `{locale}` only with `routing: false`; with `routing`, the resolved `permalink` (also as the `preview` default) goes through `localizePath()`, and an explicit `preview` is used as it is. `POST …/preview-url?locale=` resolves in that locale (`urlLocale()` validates it; the default locale otherwise).

The admin sends `locale` with `draft` and `saved` for a localized document. `merge()` in `merge-draft.ts` applies a draft only to reported data with the same `locale`, or to data without one, so a German draft never lands in the English page. `patch()` in `bind-elements.ts` applies the same rule to bound elements, with the page's `<html lang>` as its language (`de-AT` matches `de`; no `lang` takes any draft). The admin bar's Edit link adds `&locale=` from `<html lang>`, and the admin reads it into its language menu.

## Binding elements

`data-cms="<collection>:<id>:<path>"` (globals `<name>::<path>`, built by `edit()`) marks an element. On a draft,
its text becomes the value at `path` when that is a string, a number or `null`. With `data-cms-attr="src,alt"` the
listed attributes are set instead: from the value's keys when it is an object (the admin pushes media documents),
else from the value itself. Objects and arrays without `data-cms-attr` are left to `useDraft()`. A
`MutationObserver` patches elements again after a framework re-render.

## Admin bar

`preview()` picks its mode from `window.name`, which survives navigation:

| `window.name`     | Mode                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `tenon-preview`   | The admin's iframe. Live preview, no bar.                                                              |
| `tenon-preview-…` | A preview the admin opened in a tab. Live preview and the bar in `preview-tab` mode.                   |
| anything else     | The bar in `site` mode, with the hint cookie, a session and `admin` not `false`. Never on admin pages. |

Built-in items (`builtIns()`), one flat row sorted by `order`:

| Id            | Order | What it does                                             |
| ------------- | ----- | -------------------------------------------------------- |
| `dashboard`   | 10    | Links to `admin`.                                        |
| `edit`        | 20    | Opens the visual editor with the current page URL.       |
| `perspective` | 30    | The Drafts / Published menu; switching reloads the page. |

Preview tabs use fixed controls: `edit` (order 10, Back to visual editor) and `live-edit` (order 20, Edit preview).
Custom items and their loaders do not run there. The close icon calls `dismiss()`: it clears `window.name`, disconnects
the live channel, removes overlays and restores the normal bar, including custom items, without reloading. Stopping the
runtime still unmounts the bar after this transition. The iframe's live channel and controls are independent.
Returning to the admin page also clears a preview tab's name and starts no site preview runtime.

Items are registrations in `admin.adminBar.items` (see [admin](../admin/README.md)). They compose in this order:
built-in stubs, the plugins' items in plugin order, then the host's items. An item replaces an
earlier one with the same key in place and brings its own `order`. `false` instead of an item removes it, built-ins
included, before its loader runs. Items sort by `order`; items without `order` follow in insertion order. There are no
groups. A link or dropdown is rendered by the bar; its `load` may overlay `label`, `icon`, `href` and `children`, or
return `null` to hide the item for the request. A button (`onClick`) or custom control (`mount`) gets the `load`
result as `ctx.data`. Each item only gets its own data. A loader that throws or returns invalid output is logged and
that item is skipped. A `mount(el, ctx)` item renders itself with plain DOM inside the bar's shadow root.
The server cannot see the page, so the client fills `dashboard` and `edit` into the stubs, keeping their `order`. The
normal pill renders the whole sorted list inline, so custom items can sit between built-ins.

The runtime reloads item data when the page URL changes and on the existing focus/session check, drops stale
responses, and does not reload on mutations or edit-mode toggles. `ctx.tenon.reload()` reloads one item through
`POST /admin/load` with `kind: "bar-item"` (`loadAdminBarItem()`).

The session cookie is `HttpOnly`, so the page cannot see it. The auth middleware
[`session-hint.middleware.ts`](../auth/middleware/session-hint.middleware.ts) mirrors it in `tenon-session=1`, which
page code can read. The hint grants nothing: the endpoint checks the real session, and a 401 clears the hint. Any
other error or a failed chunk import shows no bar and keeps the hint.

The pill is 44 px high and overlays the page at one of eight positions (`bottom-center` by default); the page keeps its layout.
It hides on scroll down and shows on scroll up (`headroom()` in `packages/admin/src/admin-bar/headroom.ts`), and
stays shown while editing or while focus or a menu is inside it. On phones the normal bar uses at most 95% of the
viewport width. Its items scroll horizontally with `scroll-fade-x`; the dismiss button stays visible. Preview
controls keep their separate layout. The host `<div>` sits on `<html>`, not `<body>`, so a morph keeps it, with the highest
`z-index`. The bar follows `prefers-color-scheme`. With `admin: { adminBar: false }` core mounts no
`/admin-bar` route, so no bar shows.

## Re-render (`morph`)

`preview({ morph: true })` is for server-rendered pages without client data (the Astro integration passes it). On
`saved`, it fetches `location.href` with the page's cookies (so the drafts perspective), morphs `<body>` into the new
one with `idiomorph`, copies the `<title>` and patches bound elements again. Only one fetch runs at a time; a `saved`
during it queues one more. The rest of `<head>` is left alone. Prerendered pages fetch their static HTML, so they
only get the patches. `idiomorph` is bundled into the entry.

`merge()` applies draft values recursively. A value whose ids match the ids of the current, populated value keeps
the page's value at any depth: the browser cannot populate, so it keeps what the page has. Lists of objects with a
string `id` (array and block items) match by `id` in draft order, so a reordered item keeps its populated relations;
objects merge per draft key.
The admin sends image, file and relation fields as documents (`resolveDraft()` in the admin). Bound text can read
through them (`author.name`), while text bound to the relation itself is left alone. A page that holds ids
(`populate: false`) gets ids back from `merge()`.

The bar supports the eight compass positions except center-center and defaults to bottom-center, with 16 px clearance and safe-area insets. Its toolbar keeps roving keyboard focus and places every menu/portal inside the same shadow root. The Edit button opens `<admin>/presentation?url=<current page>`. Normal site pages have no live preview channel or embedded editor. Preview tabs retain field selection and live updates. Dismiss hides the bar; session expiry removes it and its listeners. Published forms remain read-only; perspective changes still reload.
