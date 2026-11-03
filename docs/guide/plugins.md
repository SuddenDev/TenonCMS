# Plugins

A plugin adds collections, globals, hooks, routes and admin pieces (fields, pages, bar items) from one place. You register it once in `tenon.config.ts`, with no second file to wire up. A plugin MAY define no collections or globals and only extend the admin.

```ts
// tenon.config.ts
import { redirects } from "tenoncms/plugins/redirects";
export default defineCms({ collections: { pages }, plugins: [redirects()] });
```

## Bundled plugins

| Plugin                       | What it does                                                                |
| ---------------------------- | --------------------------------------------------------------------------- |
| `tenoncms/plugins/redirects` | Redirects that follow path changes, an import, a lookup route, a tools page |
| `tenoncms/plugins/example`   | A starting point to copy. It uses every plugin option once.                 |

### `redirects`

```ts
redirects({ collections: ["pages"], field: "path", locales: ["en", "de"] });
```

- Adds the `redirects` collection (`from`, `to`, `permanent`, `locale`). `locales` makes `locale` a dropdown, otherwise it is free text.
- A hook creates a redirect when a listed document's path changes, and keeps chains one hop long.
- `GET /_tenon/redirects/lookup?path=` works for everyone. Add `&locale=` for a locale (see [Localization](./localization.md)).
- `POST /_tenon/redirects/import` takes an array of redirects, for admins.
- A "Redirect tools" admin page tests paths and imports.

What the site needs at a pretty URL is a framework route in your project that calls a helper the plugin exports. That is how `redirects` resolves a path:

```ts
// src/middleware.ts (Astro)
import { resolveRedirect } from "tenoncms/plugins/redirects";
import cms from "../tenon.config";

export const onRequest = defineMiddleware(async (context, next) => {
  const redirect = await resolveRedirect(cms, context.url.pathname);
  return redirect ? context.redirect(redirect.to, redirect.status) : next();
});
```

### `example`

`example({ admin: '/admin' })` is a starting point, not a feature. Its `admin` option is the admin path, used for the bar links.

- A `quotes` collection with a custom `rating` field, and a `quoteSettings` global.
- A root hook and both middlewares.
- `GET /_tenon/example/random` (a random quote as text) and `GET /_tenon/example/quotes.csv` (admins).
- A stats page with a `load` and a `pageHeader`, and a detail page.
- Four bar items: a link, a loaded dropdown, a button and a custom control.
- Browser code in plain DOM, Vue and React. `renderer: 'html' | 'vue' | 'react'` picks one for the field and pages. Vue and React are bundled into its admin chunks, so you install neither.

## Write a plugin

A plugin is an object from `definePlugin()`:

| Key                | What it adds                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | Unique and lowercase, like `redirects`. Prefix of the plugin's routes                                                                                                        |
| `collections`      | Collections, typed like yours: `cms.find('redirects')` works. A name that you or another plugin uses throws at startup                                                       |
| `globals`          | Globals, the same way. The admin renders them, so a global doubles as the plugin's settings page                                                                             |
| `hooks`            | Root hooks for every collection and global. They run after the collection's own hooks and before your root hooks                                                             |
| `routes`           | `(api) => api.get(…)` on a Hono sub-app at `/_tenon/<name>`, behind CSRF and session checks. `c.var.cms` runs with the session user, and `c.var.user` is that user           |
| `publicRoutes`     | Same, without a session. `c.var.cms` has no user. Meant for reads                                                                                                            |
| `publicMiddleware` | Hono middleware for every `/_tenon` request, auth included, before any route. `c.var.cms` has no user. Return a response to stop the request (rate limits, logging, headers) |
| `middleware`       | Hono middleware for requests with a session (writes, `/schema`, plugin `routes`), after CSRF and session checks. `c.var.user` is set. API key requests skip it               |
| `admin`            | Fields, pages and admin bar `items`, like your [`admin`](./admin.md). A plugin sets no bar `position` and never turns the bar off. Merged before yours, in plugin order      |

- Route and middleware errors map like core's: `ValidationError` is 400 with field errors, `ConflictError` is 409, anything else is 500.
- These names are reserved: `account`, `admin`, `auth`, `auth-status`, `collections`, `globals`, `invites`, `localization`, `media`, `preview` and `schema`. Names use `[a-z0-9-]`.
- Public routes run before CSRF and session checks, so a plugin MUST protect its own public writes.
- Pages call plugin routes with `client.request()`.
- A plugin that ships browser code MUST keep its `clientRef()` calls literal and keep `tenoncms/admin` external, so the adapters can find them.
- The bundled plugins import core only through its public exports, the same way a third-party plugin does.

Plugins can also add rich text features. See [Rich text](./richtext.md#add-features-from-a-plugin).

## Publish a plugin

A plugin on npm is an ordinary package with two halves: the server half (`definePlugin()`) and the browser half (the modules behind its `clientRef()`s). The bundled plugins use a repo-specific build, so start from this instead.

```jsonc
// package.json
{
  "name": "cms-plugin-quotes",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
    "./admin": { "types": "./dist/admin/index.d.mts", "default": "./dist/admin/index.mjs" },
    "./admin/bar": { "types": "./dist/admin/bar.d.mts", "default": "./dist/admin/bar.mjs" },
  },
  "files": ["dist"],
  "peerDependencies": { "tenoncms": "^0.16.0" },
}
```

```ts
// src/index.ts
export const quotes = () =>
  definePlugin({
    name: "quotes",
    admin: {
      pages: {
        stats: { mount: clientRef("cms-plugin-quotes/admin#mountStats") },
      },
      adminBar: {
        items: {
          count: { label: "Quotes", mount: clientRef("cms-plugin-quotes/admin/bar#mountCount") },
        },
      },
    },
  });
```

```ts
// tsdown.config.ts
import { defineConfig } from "tsdown";
import Vue from "unplugin-vue/rolldown"; // only for Vue components

// Bundled into the admin chunks, so the host installs neither Vue nor React.
const bundled = /^(vue|react|react-dom|scheduler)(\/|$)|^@vue\/|^tenoncms\/admin\/(vue|react)$/;

export default defineConfig({
  plugins: [Vue({ isProduction: true })],
  entry: ["src/index.ts", "src/admin/index.ts", "src/admin/bar.ts"],
  platform: "neutral",
  fixedExtension: true,
  // Everything else (`tenoncms`, `hono`, ...) comes from the host.
  external: (id, importer) => !!importer && !id.startsWith(".") && !bundled.test(id),
  // Keeps CSS imports in the output, one file per chunk, so only styled entries load CSS.
  css: { inject: true, splitting: true },
  define: {
    "process.env.NODE_ENV": '"production"',
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
  },
  dts: { vue: true },
});
```

What every published plugin MUST get right:

- **`tenoncms` is a peer dependency and stays external.** Bundling it would give the host two copies of core and break `clientRef()` and type matching. `tenoncms/admin` is the only core import the browser code needs.
- **Ship the admin half compiled.** The host's Vite may not compile `.vue`, JSX or TypeScript from `node_modules`. Bundle the framework into the admin chunks (`bundled` above) or write plain DOM. Either way, the host installs no extra package.
- **`clientRef()` takes a package path, and it MUST be a literal string.** `clientRef("cms-plugin-quotes/admin#mountStats")` resolves from the host's project root, so the plugin has to be installed there. The adapters find the call by reading the module graph of the host's `tenon.config.ts`, which has to import the plugin statically.
- **Give the admin bar its own entry.** The bar loads on every page of the site, so everything it reaches (`adminBar` items, and every key of an object or map they touch) MUST be free of CSS and of Vue `<style>` blocks. Keep the bar mounts in a separate file such as `admin/bar` and style them inline, because the bar's shadow root gets no page CSS. The adapters reject a plugin that breaks this at startup.
- **Style pages with the plugin's own CSS.** The admin's Tailwind does not scan plugin code. Only `.input` and `.btn` are shared. Plugin CSS lands in the admin's page and applies to all of it, so scope every selector: a page class, scoped styles or a Tailwind `prefix()`. An unscoped selector restyles the admin. See `packages/plugins/src/example` for a plain `?raw` file, a Vue `<style scoped>` and compiled Tailwind.
- **Build the types.** `definePlugin()` keeps the literal collection and global names, so a host gets `cms.find('quotes')` typed. If the declaration build fails with a missing type, the type is missing from core's public exports.

Before you publish, run `npm pack`, install the tarball in one of the examples and start its dev server once. A wrong `exports` entry, a bundled copy of `tenoncms` or CSS in the bar's graph all show up there.

## Typed imports in published plugins

Local source plugins can import `.client.ts` exports just like the host config. A published plugin MUST compile its server and browser entries separately. The server build uses `clientModules()` from `tenoncms/vite` with `server: true` and a mapping from source files to public browser package exports:

```ts
import { clientModules } from "tenoncms/vite";

const serverPlugin = clientModules({
  root: import.meta.dirname,
  server: true,
  references: { "./src/stats.client.ts": "cms-plugin-quotes/admin" },
});
```

Add `serverPlugin` to the server Rollup/Rolldown build's `plugins`. Keep `tenoncms/admin` external. It emits literal `clientRef("cms-plugin-quotes/admin#exportName")` calls, which host adapters already discover. Map every browser entry reached by the server build; relative references would otherwise point into the consuming app.

Build `src/stats.client.ts` as the browser entry behind the package's `./admin` export. Use `clientModules({ server: false })` in that build to check imports. Include the renderer and framework compiler as described above; compile Vue/JSX before publishing. Never use `server: true` in the browser build. Ship declarations for both entries. Explicit `clientRef()` calls remain the simplest option for plugins that do not use this build step.
