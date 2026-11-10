# Customize the admin

Everything the admin needs from your project sits in one `admin` object in `tenon.config.ts`: branding, custom fields, pages and the admin bar. Write it inline, or put it in a module and import it. Import browser exports from `.client.ts` modules, or use an explicit `clientRef()`.

```ts
// admin.ts
import { clientRef, type AdminOptions } from "tenoncms/admin";

export const admin = {
  name: "Acme",
  logo: { light: "/logo-light.svg", dark: "/logo-dark.svg" },
  icon: "/icon.svg",
  media: { nav: { group: "Assets", icon: "images" } },
  fields: {
    color: { mount: clientRef("./src/admin/color.ts#mountColor") },
  },
  pages: {
    home: {
      route: "/",
      nav: { display: "main" },
      mount: clientRef("./src/admin/home.ts#mountHome"),
    },
    stats: {
      title: "Stats",
      nav: { icon: "chart-bar", order: 5 },
      // Runs on the server. The mount gets the result as `ctx.data`.
      load: async ({ cms, user }) => ({
        editor: user.name,
        posts: await cms.find("posts", { limit: 10, populate: false, select: { title: true } }),
      }),
      mount: clientRef("./src/admin/stats.ts#mountStats"),
    },
    report: {
      route: "/reports/:id",
      nav: { display: "none" },
      mount: clientRef("./src/admin/report.ts#mountReport"),
    },
  },
} satisfies AdminOptions;

// tenon.config.ts
export default defineCms({ /* … */ admin });
```

`satisfies AdminOptions` is optional. `defineCms` types an inline object too.

## Server and browser

Only `load` functions run on the server. Browser implementations live in their own modules. The adapter turns typed imports from `.client.ts` into references; `clientRef()` remains available for explicit references.

### Typed browser imports

```ts
// admin/stats.client.ts
import { renderVue, type PageContext } from "tenoncms/admin/vue";
import Stats from "./Stats.vue";

export const mountStats = renderVue<PageContext>(Stats);

// tenon.config.ts
import { mountStats } from "./admin/stats.client";

export default defineCms({
  /* other options */
  admin: { pages: { stats: { title: "Statistics", mount: mountStats } } },
});
```

Use the same imports for custom field mounts, page headers, admin bar callbacks and rich text browser extensions. React components use `renderReact()` from `tenoncms/admin/react`. Components still use the existing mount/update/unmount contract. The host needs its framework compiler for local `.vue` or JSX source.

A `.client.ts` module is a browser entry. Its imports and closures behave like normal JavaScript in the browser. In the server build, its runtime exports become references; the module and its dependencies do not execute there. Only register those imports in browser options: do not call them, read their properties or use their constants on the server. Put shared values in ordinary modules instead. Named and default exports, aliases and static re-exports work. CommonJS browser entries are not supported.

Ordinary `.ts` modules can be shared. `.server.ts` modules MUST NOT enter the browser graph, including through shared helpers or dynamic imports resolved by the bundler. The integration rejects these imports, Node built-ins and known server-only Tenon entries. Type-only imports are erased and allowed. Keep secrets in `.server.ts` modules; this check cannot detect private strings in otherwise browser-compatible modules. Avoid runtime-computed import paths that the bundler cannot analyze.

The conventions also cover `.client.js`, `.client.mjs`, `.client.mts` and JSX/TSX, and the matching `.server` suffixes. The filename does not auto-register or execute a module. Import it from the static configuration graph to register its exports. Restart the dev server after adding references or exports; edits to existing browser implementations use the host's HMR.

Astro, Nuxt and `tenonAdmin()` install the build integration. Plain Node scripts and tests do not transform imports automatically. Untransformed functions in browser registrations or descriptions fail at CMS startup; use `clientRef()` there, or run the config through the build integration.

### Reactive field descriptions

```ts
// collections/products.client.ts
import type { FieldDescription } from "tenoncms/admin";

const limit = 1000;
export const priceDescription: FieldDescription<number | null | undefined> = ({ value }) =>
  (value ?? 0) > limit ? "Needs approval" : "Gross price";

// collections/products.ts
import { priceDescription } from "./products.client";

export const products = defineCollection({
  fields: { price: { type: "number", description: priceDescription } },
});
```

Descriptions receive the current unsaved `value`, root document `data`, containing group/item `siblings`, field `path` and admin UI `locale`. Return text (including a language map), or `null`/`undefined` to hide it. The callback MUST be synchronous. It is evaluated reactively as its inputs change and needs no server request. Load or callback failures show an error beside the field. Static descriptions keep working.

**`load` functions**

- They receive the signed-in user, the user's `cms` and the admin language as `locale`.
- They MUST only read, and MUST return JSON (`null`, booleans, strings, finite numbers, arrays, plain objects). Anything else is an error.
- Keep results small and deliberate. Being signed in does not make every server value fit for the browser.
- They read in the user's perspective: drafts only with a session and the preview cookie.

**`clientRef()`**

- It names a module and an optional `#export` (default: `default`). Relative paths resolve from the project root, not from the file that calls it. Package paths resolve through package exports.
- Astro, Nuxt and `tenonAdmin()` find the literal `clientRef()` calls in the static imports of `tenon.config.ts` without running it, and bundle those exports for the browser only.
- Computed references are rejected. Inline functions for `mount`, `onClick` or `pageHeader` are rejected too.
- Adding a `clientRef()` needs a dev server restart.

**What is public.** Only the login branding (`/admin-brand`). Fields, pages and bar items arrive after sign-in from `/schema` and `/admin-bar`, without loader functions. `POST /_tenon/admin/load` runs one loader for the signed-in user and answers with its data. It accepts registered keys only, and responses are `Cache-Control: no-store`.

**Merging.** Plugin registrations come first, then the host's. A field or page key used twice throws. Host branding wins. Bar items replace earlier items with the same id.

**Styles.** The admin runs on a page of its own, so a field or page MAY bring CSS. The admin bar is different: it loads on site pages after the session check, so its modules MUST NOT inject CSS. Put styled fields and pages behind `clientRef()`, and mount bar CSS inside the shadow root (`?inline`).

## Branding

- `name` shows in the top bar, on the login and in the page title (default `tenoncms`).
- `logo` (top bar and login) and `icon` (the tile beside the name when there is no logo) are URLs, or `{ light, dark }` pairs that follow the admin's theme.
- The admin links these files and does not bundle them. Put them in your `public/` folder (`static/` where the framework calls it that) and use the URL, like `/logo.svg`.
- The favicon is `favicon` if set, else `icon`, else your `favicon.svg`, `.ico` or `.png` in the public folder. `favicon` takes a URL or a `{ light, dark }` pair.

## Menu and navigation

`nav` is the same for collections, globals, pages and media:

| Option    | What it does                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `display` | `content` (default): the content menu. `settings`: a card on the Settings page. `main`: the top bar, next to Content and Visual Editor (in the menu sheet on phones). `none`: nowhere. |
| `group`   | The section. Default: `Content` in the content menu, `Site` on the Settings page, in the admin language.                                                                               |
| `icon`    | A [Lucide](https://lucide.dev/icons) name, type-checked.                                                                                                                               |
| `order`   | Lowest first.                                                                                                                                                                          |

- Collections and globals take `description` and `nav` in their own config, next to `label`.
- Default orders: collections 10, media 15, globals 20, pages 30. Equal orders keep their definition order. Sections appear in the order of their first item.
- `media` takes `{ label, nav }` to move the media library.
- **Settings**: the content menu has a "Settings" entry under "Manage" when any item has `display: "settings"`. It opens `/content/settings`, with one section of cards per `group`. Each card opens its global, collection or page. The default `general` and `seo` globals sit there, and so can your own: `defineGlobal({ label: "Footer", nav: { display: "settings", order: 3 }, fields })`.

## Custom fields

`fields` registers an input per custom field type. A field with `type: 'custom:color'` uses `fields.color`.

- Custom types are stored and validated as strings. Without a registered input they fall back to a text input.
- Only built-in types and `custom:` types type-check, so a typo like `'txt'` is an error.
- The admin wraps a field in its label. Your input only renders the control, in the admin's light DOM, so the shared `.input` and `.btn` classes apply.

## Custom pages

`pages` adds routes under the admin path.

- The path is `/<key>` unless `route` is set. Routes start with `/`. Nesting and params work, like `route: '/reports/:id'`.
- A page shown in the content menu or on the Settings page opens under `/content` (`/stats` becomes `/content/stats`) or `/content/settings`. `main` and `none` pages use the route as is and open full width, without the content menu.
- `title` is the navigation label, the document title and the default header text (default: the key). A page may also have `description` and `nav`.
- A page on a built-in path replaces that view. `route: '/'` with `display: 'main'` replaces the redirect from `/` to `/content` (the admin has no dashboard of its own). `route: '/collections/posts'` replaces the posts list.

### The page header

`pageHeader` controls the area above a page:

| Value                       | Result                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `true` (default)            | The title as text                                                                                                                   |
| `false`                     | Nothing                                                                                                                             |
| `[{ label, to }]`           | Breadcrumbs                                                                                                                         |
| `clientRef()` of a function | `(crumbs, { params, query, data, tenon })` returns an HTML string or breadcrumbs. `crumbs` are the route's. It MUST be synchronous. |

The HTML string is not escaped. Escape untrusted values like `params`, and prefix links with `tenon.base`.

## Actions

`actions` adds one-click buttons or external links to the top bar or the content menu. `run` runs on the server when someone clicks. The admin shows its returned text, or the message of a throw, as a toast. No browser code needed.

```ts
admin: {
  actions: {
    deploy: {
      label: "Deploy",
      nav: { icon: "rocket" },
      confirm: "Deploy the site now?",
      run: async ({ user, cms }) => {
        const res = await fetch(process.env.DEPLOY_HOOK_URL!, { method: "POST" });
        if (!res.ok) throw new Error(`The deploy hook answered ${res.status}`);
        return "Deploy started";
      },
    },
  },
}
```

- `nav.display` is `main` (the top bar, next to Content and Visual Editor, default) or `content` (the content menu). `group`, `icon` and `order` work as for pages. To join the built-in Manage section, use `display: "content"` and its labels: `group: { en: "Manage", de: "Verwaltung" }`.
- `access` decides who sees and runs it: `true`, `false`, roles or a function, like a task's. Default: admins. `/schema` lists only the actions the user MAY run, and `POST /_tenon/admin/actions/:key` checks the rule again. API keys cannot run actions.
- `run` gets the user and a `cms` bound to them, so their access rules apply. It MAY return a text (a string or one per language) for the toast. A throw answers 500 with its message.
- `confirm` (a text) makes the admin ask in a dialog first. Cancel runs nothing.
- `href` in place of `run` makes the entry an external link: an `http` or `https` URL that opens in a new tab, with the same `nav` and `access`. A link has no `confirm`. `access` only hides the link; the URL itself stays public.

```ts
actions: { analytics: { label: "Analytics", nav: { icon: "chart-line" }, href: "https://plausible.io/example.com" } }
```

- While an action runs, its button is disabled. One action sits in one place; register a second key with the same `run` to show it in both.
- Plugins add actions the same way. A key used twice throws at startup, as do a missing `label`, both or neither of `run` and `href`, an `href` that is not `http(s)`, another `display` and an unknown role.

## Writing a `mount` function

Every browser slot (field, page, bar item) is one function, `mount(el, ctx)`, exported from a module and registered with `clientRef()`. It gets an empty element and the context, and returns a cleanup. Return `{ update, unmount }` instead to also receive context changes.

For Vue and React there are ready-made wrappers. Export their result and reference the export:

```ts
// src/admin/color.ts
import { renderVue } from "tenoncms/admin/vue";
import { renderReact } from "tenoncms/admin/react";
import ColorInput from "./ColorInput.vue";

// A .vue component, gets the context as reactive props
export const mountColor = renderVue(ColorInput);
// A React component, re-rendered on context changes
export const mountColorReact = renderReact(ColorInputReact);
```

They import your `vue` or `react-dom`, so the components run in your app's runtime with HMR. The admin bundles its own Vue, so you install nothing extra and no runtime is shared with it.

Other frameworks, or none, write the function directly:

```ts
// Plain DOM
export const mountColor: Mount<FieldContext> = (el, { value, onChange }) => {
  const input = Object.assign(document.createElement("input"), { type: "color", value });
  input.oninput = () => onChange(input.value);
  el.append(input);
  return () => input.remove();
};

// Svelte 5
export const mountColor: Mount<FieldContext> = (el, ctx) => {
  const app = mount(ColorInput, { target: el, props: ctx });
  return () => unmount(app);
};
```

### Context

- **Fields** get `{ name, field, value, onChange, data }`.
- **Pages** get `{ params, query, data }`: the route params, the query string and what the page's `load` returned.
- **Bar items** get the bar context and `data`.
- All of them also get `tenon`:
  - `base`: the admin path to prefix links with
  - `navigate(path)`: opens an admin view without a reload
  - `reload()`: runs the `load` of that field, page or item again
  - `locale`: the admin language
- Plain links under `base` also open in the admin. For writes, use `createClient()` from `tenoncms/client`. The admin's session cookie makes them work.

### Loading data

`data` is `undefined` without a `load`. With one, the first mount waits for the browser code and the data, and shows a loading state in its own area. A failed load shows a local error with a retry, never a server stack.

- A page reloads when its route params or query change. It never shows the previous route's data as current.
- A field loads when it mounts and when its owner changes, for example when a new document gets its id on first save. Typing in the field does not reload it, and `update(ctx)` still gets the new `value`.
- A bar item loads with the bar request, again when the page URL changes and on the existing focus check.
- Responses that arrive after cleanup or after a newer request are dropped. A 401 ends the session as usual.

There are no extra events (`onSave`, subscriptions). `update(ctx)`, the field setter, your framework's watchers and the server hooks cover those cases.

Navigating between two URLs of the same page, say `/reports/posts/1` to `/reports/posts/2?tab=body`, calls `update` with the new context instead of remounting. `renderVue` and `renderReact` turn that into prop changes, so watch `params` or put it in an effect's dependencies to refetch. The `example` plugin's `quote` page does this.

Not available yet: switching between Drafts and Published without a reload, and loaders that depend on unsaved form values.

## Languages

The admin speaks English and German.

- Each user picks the language under "Interface language" in the user menu. The browser keeps the choice (`tenon-admin-locale` in `localStorage`). Without one, the admin follows the browser language.
- It is independent of the content languages in `localization`. Server validation messages stay English.
- Every label and description you write takes a plain string, or one string per language: `label: { en: "Posts", de: "Beiträge" }`. That covers collections, globals, fields, blocks, `itemLabels.singular` and `plural`, `nav.group`, page `title` and `description`, bar item labels (also from a loader) and `media.label`. A missing language shows English, then the first entry.
- Your browser code gets the language as `ctx.tenon.locale` (`"en"` or `"de"`), in pages, fields, page headers and bar items. A switch calls `update(ctx)`. Server `load` functions get it as `locale`.

`translator()` from `tenoncms/admin` reads your own message files:

```ts
import { translator } from "tenoncms/admin";
import en from "./locales/en.json";
import de from "./locales/de.json";

export const mountStats: Mount<PageContext> = (el, ctx) => {
  const t = translator({ en, de }, ctx.tenon.locale);
  el.textContent = t("stats.count", { n: 3 }); // "{n} quotes" in en.json
  // …
};
```

Keys are dotted paths, `{name}` fills a parameter, and a missing key falls back to English, then to the key. `translate(text, locale)` resolves one `{ en, de }` value. The bundled redirects and example plugins use both.

## Translations

With `localization`, the document "…" menu has a **Sync Content Structure** submenu for entries with lists, and Settings has a **Translations** page with one switch per entry and an **Apply to all…** button per collection. See [Localization](./localization.md#same-content-structure-in-all-languages).

## Serve the admin elsewhere

Pass a path: `admin: '/cms'` to the Astro integration or the Nuxt module, or `tenonAdmin({ path: '/cms' })` with a matching route file (`src/routes/cms.$.ts`). To ship no admin at all, pass `admin: false`. Core never imports the admin, so it only lands in your bundle when you mount it.

Plugins contribute the same `admin` object through [`definePlugin({ admin })`](./plugins.md).
