# admin

Glue that serves the admin UI on a page of its own. The UI itself is the Vue app in `packages/admin`; its build writes `index.js` next to these files in `dist/admin`.

| File                 | What it does                                                                       |
| -------------------- | ---------------------------------------------------------------------------------- |
| `index.d.ts`         | Types of `integral-cms/admin`: `defineAdmin()`, `Mount`, page and field contexts.  |
| `entry.ts`           | The page script: mounts the admin with the host's `integral.admin.ts` and favicon. |
| `default.ts`         | Empty options, used when the host has no `integral.admin.ts`.                      |
| `html.ts`            | Builds the admin HTML page, plus path and favicon helpers all adapters share.      |
| `menu.ts`            | `groupMenu()`: sorts sidebar items and groups them (default `Content`).            |
| `icons.d.ts`         | Generated `IconName` union of the Lucide icons. Run the admin's `icons` script.    |
| `virtual.d.ts`       | Types the `#integral/admin-html` module (the page as a string).                    |
| `vue.ts`, `react.ts` | `renderVue()` / `renderReact()`: wrap a host component as a `Mount`.               |

Extensions only use `mount(el, ctx)`, so no framework crosses the boundary.
