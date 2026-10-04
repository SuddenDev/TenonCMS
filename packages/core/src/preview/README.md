# preview

Live preview. The admin shows the site next to the form and pushes unsaved form state into it over a
`BroadcastChannel` (`integral-cms:preview`). Nothing here touches the database except `url.ts`.

| File          | What it does                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `template.ts` | `placeholders()` and `resolve()` for `preview` templates like `'/{category.slug}/{slug}'`. No imports.                                     |
| `url.ts`      | `previewUrl()`: the URL of a document or global from its form state. Reads one relation hop with `findById`, or calls the host's function. |
| `index.ts`    | `integral-cms/preview`, the browser runtime: `edit()`, `preview()`, `subscribe()`, `getDrafts()`, `merge()`. No code runs at import time.  |
| `vue.ts`      | `integral-cms/preview/vue`: `useDraft(collection, doc)`, a shallow ref with the draft merged in.                                           |
| `react.ts`    | `integral-cms/preview/react`: `useDraft(collection, doc)` on `useSyncExternalStore`.                                                       |

`index.ts`, `vue.ts` and `react.ts` run in the browser and in server bundles. They MUST NOT import zod or core
runtime code.

## Messages

| Message                                   | From  | What it does                                                                                |
| ----------------------------------------- | ----- | ------------------------------------------------------------------------------------------- |
| `{ type: 'draft', collection, id, data }` | admin | The form state of a document. `id` is `''` for a global. Stored by `<collection>:<id>`.     |
| `{ type: 'mode', edit }`                  | admin | Sets or removes `data-cms-edit` on `<html>`. In edit mode, bound elements outline on hover. |
| `{ type: 'edit', collection, id, path }`  | site  | A click on a bound element in edit mode. The admin focuses that field.                      |
| `{ type: 'url', href }`                   | site  | Sent when the runtime starts, so the admin knows the current page.                          |
| `{ type: 'saved', collection, id }`       | admin | A draft save. With `morph`, the page re-renders from the server; otherwise ignored.         |

## Binding elements

`data-cms="<collection>:<id>:<path>"` (globals `<name>::<path>`, built by `edit()`) marks an element. On a draft,
its text becomes the value at `path` when that is a string, a number or `null`. With `data-cms-attr="src,alt"` the
listed attributes are set instead: from the value's keys when it is an object (the admin pushes media documents),
else from the value itself. Objects and arrays without `data-cms-attr` are left to `useDraft()`. A
`MutationObserver` patches elements again after a framework re-render.

The runtime starts only when `window.name` starts with `integral-preview`: the admin names its iframe and the tabs it
opens that way, and the name survives navigation.

## Re-render (`morph`)

`preview({ morph: true })` is for server-rendered pages without client data (the Astro integration passes it). On
`saved`, it fetches `location.href` with the page's cookies (so the drafts perspective), morphs `<body>` into the new
one with `idiomorph`, copies the `<title>` and patches bound elements again. Only one fetch runs at a time; a `saved`
during it queues one more. The rest of `<head>` is left alone. Prerendered pages fetch their static HTML, so they
only get the patches. `idiomorph` is bundled into the entry.

`merge()` replaces top-level keys with draft values, except a value of ids that match the ids of the current,
populated value: the browser cannot populate, so it keeps what the page has.
