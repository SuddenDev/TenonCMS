# preview

Live preview. The admin shows the site next to the form and pushes unsaved form state into it with `postMessage`.
Nothing here touches the database except `url.ts`.

The admin resolves relative preview URLs against the `site` option of `defineCms()` (default: its own origin). The
page talks only to its `parent` (the admin's iframe) or `opener` (a tab the admin opened), and only after that window
sent a first message from the origin of the `admin` option (a path for the site's own origin, or a full URL like
`https://cms.example.com/admin`); it posts only to that origin. The admin accepts and posts only to the site's origin.
On another origin, drafts reach the page through messages, but the drafts perspective needs the preview cookie, so a
server render shows drafts only when the site shares the admin's cookies (same site).

| File          | What it does                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `template.ts` | `placeholders()` and `resolve()` for `preview` templates like `'/{category.slug}/{slug}'`. No imports.                                                    |
| `url.ts`      | `previewUrl()`: the URL of a document or global from its form state. Reads one relation hop with `findById`, or calls the host's function.                |
| `index.ts`    | `integral-cms/preview`, the browser runtime: `edit()`, `preview()` (with the bars), `subscribe()`, `getDrafts()`, `merge()`. No code runs at import time. |
| `vue.ts`      | `integral-cms/preview/vue`: `useDraft(collection, doc)`, a shallow ref with the draft merged in.                                                          |
| `react.ts`    | `integral-cms/preview/react`: `useDraft(collection, doc)` on `useSyncExternalStore`.                                                                      |

`index.ts`, `vue.ts` and `react.ts` run in the browser and in server bundles. They MUST NOT import zod or core
runtime code.

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

## Modes and bars

`preview()` picks its mode from `window.name`, which survives navigation:

| `window.name`        | Mode                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `integral-preview`   | The admin's iframe. Live preview, no bar.                                                            |
| `integral-preview-…` | A preview the admin opened in a tab. Live preview and the preview bar.                               |
| anything else        | The admin bar, only with the `integral-preview` cookie, a session and `admin` not `false`. Else off. |

Both bars are one `<div data-cms-bar>` built by `bar()`, fixed at the top, 32 px high. It is appended to `<html>`, not
`<body>`, so a morph keeps it; `<html>` gets `margin-top: 32px` while it shows.

- Preview bar: an "Edit" switch (`data-cms-edit` on `<html>`; a later `mode` message wins), the Drafts / Published
  toggle and "Exit preview" (clears `window.name` and reloads).
- Admin bar: "Admin" (links to `admin`), one "Edit <collection>" link per distinct `collection:id` in `[data-cms]`
  (`<admin>/presentation/collections/<collection>/<id>`, `<admin>/presentation/globals/<name>`; scanned on start and
  on `DOMContentLoaded`) and the toggle. It shows only after `GET /api/cms/auth/get-session` returns a session
  (better-auth answers `null` without one). It never shows on the admin's own pages.

The toggle reads the perspective from the cookie (`drafts`, else published), and a click sends
`POST /api/cms/preview` with `{ perspective }`, then reloads. The cookie is not `HttpOnly` for this; it grants
nothing without a session.

## Re-render (`morph`)

`preview({ morph: true })` is for server-rendered pages without client data (the Astro integration passes it). On
`saved`, it fetches `location.href` with the page's cookies (so the drafts perspective), morphs `<body>` into the new
one with `idiomorph`, copies the `<title>` and patches bound elements again. Only one fetch runs at a time; a `saved`
during it queues one more. The rest of `<head>` is left alone. Prerendered pages fetch their static HTML, so they
only get the patches. `idiomorph` is bundled into the entry.

`merge()` replaces top-level keys with draft values, except a value of ids that match the ids of the current,
populated value: the browser cannot populate, so it keeps what the page has.
