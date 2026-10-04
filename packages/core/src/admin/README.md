# admin

Glue that serves the admin UI on a page of its own. The UI itself is the Vue app in `packages/admin`; its build writes `index.js` next to these files in `dist/admin`.

| File                 | What it does                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `index.d.ts`         | Types of `integral-cms/admin`: `defineAdmin()`, `Nav`, `Mount`, page and field contexts. |
| `entry.ts`           | The page script: mounts the admin with the host's `integral.admin.ts` and favicon.       |
| `default.ts`         | Empty options, used when the host has no `integral.admin.ts`.                            |
| `html.ts`            | Builds the standalone admin page from script and stylesheet URLs.                        |
| `path.ts`            | Validates the admin route and resolves the host configuration alias.                     |
| `favicon.ts`         | Detects the host favicon and passes it through a Vite define.                            |
| `input.ts`           | Names and registers the admin client build entry.                                        |
| `options.ts`         | Shared admin path and framework adapter options.                                         |
| `menu.ts`            | `groupMenu()`: sorts items and groups them (fallback group `Content`, or the one given). |
| `icons.d.ts`         | Generated `IconName` union of the Lucide icons. Run the admin's `icons` script.          |
| `virtual.d.ts`       | Types the `#integral/admin-html` module (the page as a string).                          |
| `vue.ts`, `react.ts` | `renderVue()` / `renderReact()`: wrap a host component as a `Mount`.                     |

Extensions only use `mount(el, ctx)`, so no framework crosses the boundary.
