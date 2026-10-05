# admin

The contract and page runtime of the admin UI and the admin bar, shipped in `dist/admin`. The UI itself is the Vue app in `packages/admin`; its build writes `index.js` and `bar.js` next to these files. How adapters serve the page (path, alias, favicon, build input, HTML) lives in `src/integrations/admin/`.

## Follow the admin page

The page that `adminHtml()` renders loads:

`entry.ts` → `#integral/admin` (`integral.admin.ts` or `default.ts`) → `mountAdmin()` in `index.js`

`entry.ts` reads the base path from `data-base` and the favicon from the `__INTEGRAL_FAVICON__` define, then mounts the admin with the host's options. Host fields and pages are `Mount` functions; `renderVue()` and `renderReact()` build one from a component.

## Files

| Path                 | Responsibility                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.d.ts`         | Types of `integral-cms/admin`: `defineAdmin()`, `Nav`, `Mount`, page and field contexts, `AdminBarItem`, `ServerAdminBarItem`, `AdminBarContext`. |
| `bar.d.ts`           | Types of `integral-cms/admin/bar`: `mountAdminBar()`. The preview runtime imports it dynamically.                                                 |
| `entry.ts`           | The page script: mounts the admin.                                                                                                                |
| `default.ts`         | Empty options, used when the host has no `integral.admin.ts`.                                                                                     |
| `virtual.d.ts`       | Types the `#integral/admin-html` module (the page as a string).                                                                                   |
| `icons.d.ts`         | Generated `IconName` union of the Lucide icons. Run the admin's `icons` script.                                                                   |
| `vue.ts`, `react.ts` | `renderVue()` / `renderReact()`: wrap a host component as a `Mount`.                                                                              |
| `menu.ts`            | `groupMenu()`: sorts items and groups them (fallback group `Content`, or the one given).                                                          |

Extensions only use `mount(el, ctx)`, so no framework crosses the boundary. `entry.ts`, `default.ts` and the `.d.ts` files are copied to `dist/admin` as is, so they MUST keep their names. `menu.ts` MUST stay free of imports, because the admin bundles it by relative path. Core imports `integral-cms/admin/bar` by its own export and keeps it external in tsdown; tsconfig `paths` and a vitest alias point it at `bar.d.ts`.
