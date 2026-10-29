# example

A plugin to read and copy, not a feature. It uses every plugin option once, around a `quotes` collection:

```ts
import { example } from "tenoncms/plugins/example";

defineCms({ plugins: [example()] });
```

| Path          | What it is                                                                                |
| ------------- | ----------------------------------------------------------------------------------------- |
| `index.ts`    | The server half: collections, globals, hooks, middleware, routes and admin registrations. |
| `types.ts`    | Types shared by the server `load` functions and the browser code.                         |
| `admin/html`  | Browser code with plain DOM.                                                              |
| `admin/vue`   | The same field and pages as Vue components, wrapped with `renderVue()`.                   |
| `admin/react` | The same field and pages as React components, wrapped with `renderReact()`.               |
| `admin/utils` | Helpers that every renderer shares, e.g. `stars()` and `esc()`.                           |

## Why three admin folders

The admin only knows `mount(el, ctx)`, so the browser code of a plugin can use any framework or none. Each folder shows one way. The `renderer` option picks the folder for everything that is shown: the rating field, the pages, the page header and the quote count in the bar. `example({ renderer: "vue" })`. The bar item lives in its own `bar` entry per folder, because the bar's module graph MUST NOT contain CSS and the page entries of `vue` and `react` do. Because `clientRef()` MUST be a literal, `index.ts` spells out every variant and picks one at runtime.

Vue and React are bundled into their admin chunks, so a host installs neither. Plain DOM ships the least code.

## Styling

Each folder styles the stats and quote pages differently. `admin/html` has a plain `example-plugin.css` under `.example-page`, shared by both pages, imported as `?inline` and injected once. `admin/vue` uses a scoped `<style>`. `admin/react` uses Tailwind utilities that the plugin build compiles (`tailwind.css`, utilities only, no base styles) with `prefix(ex)`, so its classes are `ex:flex` and its theme variables `--ex-*`. The admin's own Tailwind does not see plugin code. Plugin CSS applies to the whole admin page: without the prefix, the plugin's `.flex` would come after the admin's in the same `utilities` layer and beat the admin's `max-sm:hidden`.

## Rich text

`quotes.notes` is a Tiptap JSON field. `notice.ts` is its shared `exampleNotice` schema; `admin/richtext.ts` exports the browser extension and translated toolbar control. The plugin registers them with `admin.richtext.extensions` and a literal `clientRef("tenoncms/plugins/example/admin/richtext#notice")`. Use that feature name in a field’s `allowed` list.
