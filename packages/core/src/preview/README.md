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

`runtime/preview.ts` → `runtime/store.ts` → `runtime/bind-elements.ts`

`preview()` picks the mode from `window.name`. `startLive()` opens the channel to the admin (`openChannel()`), which
connects on the admin's first message. A `draft` message goes to `setDraft()`, which notifies `useDraft()`
subscribers, and `patchAll()` writes the new values into bound elements. A `MutationObserver` patches again after a
framework re-render and reports the bound documents. With `morph`, a `saved` message runs `createRerender()`.

## Follow the admin bar

`preview()` on a site page flows through:

`runtime/preview.ts` → `runtime/admin-bar.ts` → `GET /api/cms/admin-bar` (`endpoints/admin-bar.endpoint.ts` →
`config/admin-bar.ts`) → `import("integral-cms/admin/bar")` → `mountAdminBar()`

`preview()` starts the bar when `admin` is not `false`, the page is not under the admin's path, and the
`integral-session` hint cookie is set (`hasSessionHint()`). `startAdminBar()` asks the endpoint for the page's items
(`loadAdminBar()`). The endpoint runs the items hooks over the built-in stubs (`builtIns("site")`) and answers
`{ position, items }`. `fillItems()` turns the stubs into links for the page, and `composeItems()` appends the
`addAdminBarItem()` items and sorts. The bar chunk loads only then, so visitors download nothing extra. It mounts into
an open shadow root on a `<div data-cms-bar>` on `<html>`. The bar renders the context and calls its actions; the
runtime owns all state and calls `update()` when the bound documents, the edit mode or the added items change.

## Files

| Path                              | Responsibility                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `index.ts`                        | Browser-safe public exports.                                                                       |
| `vue.ts`                          | `useDraft()` using a Vue shallow ref.                                                              |
| `react.ts`                        | `useDraft()` using React's external store.                                                         |
| `config/types.ts`                 | `Preview`, `Drafts`, `PreviewMessage`, `PreviewOptions` and `Unsubscribe`.                         |
| `config/admin-bar.ts`             | `AdminBarOptions`, `AdminBarItemsHook` and `runItemHooks()`.                                       |
| `endpoints/`                      | `POST /preview` sets the preview cookie, `DELETE /preview` clears it.                              |
| `endpoints/admin-bar.endpoint.ts` | `GET /admin-bar?url=`: the page's `{ position, items }`. Protected.                                |
| `server/resolve-url.ts`           | `previewUrl()`: runs the host's function, or fills a template after one relation hop.              |
| `templates/placeholders.ts`       | `PLACEHOLDER` and `placeholders()`: the dot paths of a template.                                   |
| `templates/resolve-template.ts`   | `resolveTemplate()`: fills a template, or `null` when a value is missing.                          |
| `runtime/preview.ts`              | `preview()`: mode, message channel and origin checks, observer, edit clicks and morph re-renders.  |
| `runtime/store.ts`                | The singleton draft snapshot, `draftKey()` and subscriptions.                                      |
| `runtime/merge-draft.ts`          | `merge()`: applies a draft, keeping populated values whose ids match.                              |
| `runtime/bind-elements.ts`        | `edit()`, `parseBinding()`, DOM patches, highlights and `boundDocuments()`.                        |
| `runtime/admin-bar.ts`            | `startAdminBar()`: loads the items, mounts the bar in a shadow root, `fillItems()`.                |
| `runtime/admin-bar-items.ts`      | `builtIns()`, `composeItems()` and the `addAdminBarItem()` registry.                               |
| `runtime/site-api.ts`             | The site's calls and cookies: session hint, `loadAdminBar()`, `perspective()`, `setPerspective()`. |

`index.ts`, `vue.ts` and `react.ts` run in the browser and in server bundles. They MUST NOT import zod or core
runtime code. `runtime/` imports only types from `admin/index.d.ts` and loads the bar with a dynamic
`import("integral-cms/admin/bar")`, which the host's bundler splits into its own chunk. Files in `templates/` MUST import
only from each other.

## Messages

| Message                                   | From  | What it does                                                                                                                                                                                        |
| ----------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ type: 'ready' }`                       | site  | Sent to `"*"` when the runtime starts. The admin answers with `mode` and the current draft.                                                                                                         |
| `{ type: 'draft', collection, id, data }` | admin | The form state of a document. `id` is `''` for a global. Stored by `<collection>:<id>`.                                                                                                             |
| `{ type: 'mode', edit }`                  | admin | Sets or removes `data-cms-edit` on `<html>`. In edit mode, bound elements outline on hover.                                                                                                         |
| `{ type: 'highlight', collection, id }`   | admin | Marks the elements of that document with `data-cms-highlight` (outlined); `collection: null` clears it.                                                                                             |
| `{ type: 'edit', collection, id, path }`  | site  | A click on a bound element in edit mode. The admin focuses that field.                                                                                                                              |
| `{ type: 'url', href }`                   | site  | Sent after the admin's first message, so the admin knows the current page.                                                                                                                          |
| `{ type: 'documents', documents }`        | site  | `{ collection, id }` of every bound document, once each, in page order. Sent after the admin's first message and on every DOM change that changes the list. The admin lists them as "On this page". |
| `{ type: 'saved', collection, id }`       | admin | A draft save. With `morph`, the page re-renders from the server; otherwise ignored.                                                                                                                 |

## Binding elements

`data-cms="<collection>:<id>:<path>"` (globals `<name>::<path>`, built by `edit()`) marks an element. On a draft,
its text becomes the value at `path` when that is a string, a number or `null`. With `data-cms-attr="src,alt"` the
listed attributes are set instead: from the value's keys when it is an object (the admin pushes media documents),
else from the value itself. Objects and arrays without `data-cms-attr` are left to `useDraft()`. A
`MutationObserver` patches elements again after a framework re-render.

## Admin bar

`preview()` picks its mode from `window.name`, which survives navigation:

| `window.name`        | Mode                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `integral-preview`   | The admin's iframe. Live preview, no bar.                                                              |
| `integral-preview-…` | A preview the admin opened in a tab. Live preview and the bar in `preview-tab` mode.                   |
| anything else        | The bar in `site` mode, with the hint cookie, a session and `admin` not `false`. Never on admin pages. |

Built-in items (`builtIns()`):

| Id             | Group   | Order | What it does                                                                                                                                       |
| -------------- | ------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboard`    | `start` | 10    | Links to `admin`.                                                                                                                                  |
| `edit`         | `end`   | 10    | One bound document: "Edit <collection>" to `<admin>/content/collections/<c>/<id>` (`…/content/globals/<name>`). Several: a dropdown. None: hidden. |
| `live-edit`    | `end`   | 20    | Site: links to `<admin>/presentation?url=<page>`. Preview tab: the edit switch (`data-cms-edit`); a later `mode` message wins.                     |
| `perspective`  | `end`   | 30    | The Drafts / Published menu, as in the admin's app bar. Reads the `integral-preview` cookie; `setPerspective()` sets it and reloads.               |
| `exit-preview` | `end`   | 40    | Preview tab only, added on the client. Clears `window.name` and reloads.                                                                           |

Items compose in this order: built-in stubs, the plugins' `adminBar.items` hooks in plugin order, the host's
`adminBar.items`, then `addAdminBarItem()` calls. A hook gets the whole list and returns a new one; one that throws is
logged and skipped. An item replaces an earlier one with the same id. `start` sorts before `end`, then by `order`;
items without `order` follow in insertion order. Server items MUST be JSON (`ServerAdminBarItem` has no `onClick` or `mount`). A `mount(el, ctx)` item renders itself
with plain DOM inside the bar's shadow root.
The server cannot see the page, so the client fills `dashboard`, `edit` and `live-edit` into the stubs the hooks
leave, keeping their `group` and `order`. The bar renders `perspective` and the preview tab's `live-edit` as switches
itself: hooks MAY move or drop them, not restyle them.

The session cookie is `HttpOnly`, so the page cannot see it. The auth middleware
[`session-hint.middleware.ts`](../auth/middleware/session-hint.middleware.ts) mirrors it in `integral-session=1`, which
page code can read. The hint grants nothing: the endpoint checks the real session, and a 401 clears the hint. Any
other error or a failed chunk import shows no bar and keeps the hint.

The bar is 30 px high and overlays the page at `position` (`top` by default, or `bottom`); the page keeps its layout.
It hides on scroll down and shows on scroll up (`headroom()` in `packages/admin/src/admin-bar/headroom.ts`), and
stays shown near the top and while focus or a menu is inside it. Below 640 px the `end` group moves into a sheet that
opens from the right. The host `<div>` sits on `<html>`, not `<body>`, so a morph keeps it, with the highest
`z-index`. The bar follows `prefers-color-scheme`. With `adminBar: false` on `defineCms()` core mounts no
`/admin-bar` route, so no bar shows.

## Re-render (`morph`)

`preview({ morph: true })` is for server-rendered pages without client data (the Astro integration passes it). On
`saved`, it fetches `location.href` with the page's cookies (so the drafts perspective), morphs `<body>` into the new
one with `idiomorph`, copies the `<title>` and patches bound elements again. Only one fetch runs at a time; a `saved`
during it queues one more. The rest of `<head>` is left alone. Prerendered pages fetch their static HTML, so they
only get the patches. `idiomorph` is bundled into the entry.

`merge()` replaces top-level keys with draft values, except a value of ids that match the ids of the current,
populated value: the browser cannot populate, so it keeps what the page has.
