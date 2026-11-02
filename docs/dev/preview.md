# Live preview and the admin bar

Code: `packages/core/src/preview/` (see its README). User docs: [live preview](../guide/live-preview.md).

## Two halves

- **Server**: turns a `permalink` or `preview` template into a URL. Templates walk groups and at most one single relation. A function gets `{ cms, locale }`. The preview-URL endpoints are protected.
- **Browser runtime**: runs on the site. It talks to the admin by `postMessage`, binds elements, applies unsaved edits and shows the admin bar.

Browser entry points MUST NOT import the server resolver, zod or the CMS runtime.

## URLs

- `preview` defaults to `permalink`. Only `permalink` feeds `alternates`.
- With localization routing on, a `permalink` result gets the locale prefix; an explicit `preview` does not. With routing off, `{locale}` in a template is filled in.
- A placeholder naming an unknown field throws at startup.

## The runtime

- It picks a mode from the window: inside the admin's preview iframe, in a preview tab the admin opened, or on any other page (admin bar only).
- It accepts messages only from the expected parent or opener, and only from the configured admin origin.
- It tells the admin the page's URL and which documents it shows (so "On this page" works), again after every DOM change and `popstate`, because client-side navigation sends no new `ready`. The admin writes the URL to `?url=`. It highlights bound elements on request.
- Unsaved edits arrive as `draft` messages. They apply to bound elements immediately. With the `morph` option, pages that render on the server refresh after each save: the runtime fetches the page again with the preview cookie and morphs the DOM. `morph` is off by default; the Astro adapter turns it on.
- A draft only applies to data of the same locale (or no locale).
- The admin sends image, file and relation fields as documents, not ids. `patch()` ignores an object without `data-cms-attr`, so text bound to a relation keeps the page's value.
- `merge` of a draft into a document is recursive. Items in lists match by `id`. A relation whose ids did not change keeps its populated value.
- Collections and globals with `visualEditing: false` are never offered for picking; live drafts still apply.
- One store is shared across the Vue and React entries on purpose. Keep listener identity and cleanup idempotent.

## The admin bar

- It is composed on the server from built-in items, plugin items and host items, in that order. Items are one flat, sorted list, keyed by id. `false` removes an item.
- Each item may have its own loader. Loaders run in parallel on every bar request. A failing loader skips that item only. Results MUST be JSON.
- The bar loads only when the session hint cookie is set, and a 401 clears the hint. In the admin's iframe there is no bar. A preview tab gets a fixed, smaller set of controls.
- It renders in an **open shadow root** with the highest `z-index`. See [gotchas](gotchas.md#admin-ui-and-admin-bar) for the CSS traps that follow.
- Code that the bar reaches is treated as site code. It MUST NOT contain CSS.
