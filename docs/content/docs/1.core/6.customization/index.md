---
title: Customization
description: Change how the admin looks, and add your own inputs, pages and features.
navigation:
  title: Overview
---

The admin works without any setup. But if it does not fit your project, you can change and extend it. Tenons comes with built-in extension logic and ui "hooks". They are not separate builds, and your own admin code gets hot reload in development. If you need to customize the admin to the core, you can fork the admin package or build your own.

Most of it sits in the `admin` object of `defineCms()`:

```ts [tenon.config.ts]
import { defineCms } from "tenoncms";
import { RedirectsPlugin } from "tenoncms/plugins/redirects";
import { mountColor } from "./src/admin/color.client";
import { mountStats } from "./src/admin/stats.client";

export default defineCms({
  // ...
  admin: {
    logo: "/logo.svg",
    fields: { color: { mount: mountColor } },
    pages: { stats: { title: "Stats", mount: mountStats } },
    actions: {
      deploy: {
        label: "Deploy",
        run: async () => {
          await fetch(process.env.DEPLOY_HOOK_URL!, { method: "POST" });
          return "Deploy started";
        },
      },
    },
    adminBar: { position: "bottom-right" },
  },
  plugins: [RedirectsPlugin()],
});
```

## What you can change

| To                                             | Use                                    | See                                                                           |
| ---------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| Show your logo and name                        | `logo`, `icon`, `favicon`, `site.name` | [Branding](/docs/core/customization/admin#branding)                           |
| Move, group or hide entries in the menu        | `nav`                                  | [Navigation](/docs/core/customization/admin#navigation)                       |
| Add links and buttons to the bar on your site  | `adminBar`                             | [Admin bar](/docs/core/customization/admin#admin-bar)                         |
| Serve the admin at another path, or not at all | `path`, `admin: false`                 | [Admin path](/docs/core/customization/admin#admin-path)                       |
| Give a field its own input                     | `custom:<name>` and `fields`           | [Custom fields](/docs/core/customization/custom-fields)                       |
| Add a dashboard, a report or a tool            | `pages`                                | [Custom pages and actions](/docs/core/customization/custom-pages-and-actions) |
| Run server code from a button                  | `actions`                              | [Actions](/docs/core/customization/custom-pages-and-actions#actions)          |
| Style your fields and pages                    | CSS, Tailwind, `.input` and `.btn`     | [Styles and UI libraries](/docs/core/customization/styles-and-ui-libraries)   |
| Add a node or mark to the rich text editor     | `richtext.extensions`                  | [Rich text extensions](/docs/core/customization/rich-text-extensions)         |
| Add a ready-made feature, or share your own    | `plugins`                              | [Plugins](/docs/core/customization/plugins)                                   |

## Server and browser

Your config runs on the server. Some of what you add runs in the browser, inside the admin: inputs, pages, admin bar items and editor extensions. Actions run only on the server, so they need no browser code.

- **Any UI library works.** Each slot takes a `mount(el, ctx)` function that renders into an element. `renderVue()` and `renderReact()` make one from a component.
- **Server data** comes from a `load` function next to the browser code. It runs on the server with the editor's `cms`, and returns JSON.

### Browser modules

Browser code sits in modules whose names end in `.client.ts`. Your config imports from them, but on the server the import is only a reference. The build bundles the module for the browser alone, with hot reload in development:

```ts [tenon.config.ts]
import { mountColor } from "./src/admin/color.client";

export default defineCms({
  // ...
  admin: {
    fields: { color: { mount: mountColor } },
  },
});
```

- Only pass these imports to the admin. Do not call them or read their values on the server. Put values that both sides need in an ordinary module.
- Code in `.server.ts` modules MUST NOT reach a `.client.ts` module. Keep secrets there. The build rejects such imports, and Node built-ins too.
- `.client.js`, `.client.tsx` and the other script extensions work the same way.
- Browser code MAY import CSS. It applies to the whole admin, so scope every selector. See [Bring your own CSS](/docs/core/customization/styles-and-ui-libraries#bring-your-own-css).
- Astro, Nuxt and `tenonAdmin()` set this up. On Nuxt, restart the dev server when a new export does not show.

### `clientRef()`

`clientRef()` from `tenoncms/admin` names a browser export without an import. Plugins use it, because their browser code comes from a package:

```ts
import { clientRef } from "tenoncms/admin";

fields: { color: { mount: clientRef("./src/admin/color.ts#mountColor") } },
```

- A relative path starts at the project root, not at the file that calls it. A package path, like `my-plugin/admin#mountColor`, resolves through the package's exports.
- `#name` picks the export. The default is `default`.
- The argument MUST be a literal string. The build finds the call by reading your config, without running it.

## Limits

- The admin's colors and fonts are fixed. Branding covers the logo, the icon and the name.
- The admin speaks English and German. Your labels can be in both.
- A field's `load` runs on the server, so it cannot see values the editor has not saved yet. A [description](/docs/guide/recipes/build-a-custom-field#show-the-name-under-the-field) can.

## Related resources

- [Build a custom field](/docs/guide/recipes/build-a-custom-field): a step-by-step field with server data, translations and styles.
- [Write a plugin](/docs/guide/recipes/write-a-plugin): bundle your customizations for other projects.
- [Collections and globals](/docs/core/content-modeling/collections-and-globals): `label`, `description` and `nav` of each entry.
