# Admin bar

## Goal

A signed-in editor who visits the site gets a bar with shortcuts into the admin, like WordPress's admin bar. Today
`preview/runtime/bars.ts` builds two small vanilla bars by hand. This spec replaces them with one Vue bar that:

- reuses the admin's shadcn components, reka-ui and theme tokens;
- loads only for signed-in editors, so visitors download nothing extra;
- takes extra items from plugins, the host config and page code;
- hides on scroll down and shows on scroll up (headroom), at the top or the bottom of the page;
- collapses its right group into a sheet on mobile.

The admin's own top bar is renamed "app bar" (`useToolbar()` → `useAppBar()`), so "admin bar" means only this one.

## Usage

```ts
// integral.config.ts
defineCms({
  // `false` turns the bar off. Omitted: `{ position: "top" }`.
  adminBar: {
    position: "bottom",
    items: (items, { user, url }) => [
      ...items,
      { id: "analytics", group: "end", label: "Analytics", href: `/admin/reports?url=${url}` },
    ],
  },
});

// A plugin
definePlugin({
  name: "redirects",
  adminBar: {
    items: (items) => [
      ...items,
      { id: "redirect", label: "Add redirect", href: "/admin/redirects" },
    ],
  },
});

// Page code
import { addAdminBarItem } from "integral-cms/preview";
const remove = addAdminBarItem({
  id: "clear-cache",
  label: "Clear cache",
  onClick: () => fetch("/purge"),
});
```

## Layout

| Group   | Items (built-in ids)                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| `start` | `dashboard`: links to `admin`.                                                                                  |
| `end`   | `edit`, `live-edit`, `perspective`, and `exit-preview` in a preview tab, then host and plugin items by `order`. |

- `edit`: one bound document → "Edit <collection>" link to `<admin>/content/collections/<c>/<id>` (globals
  `…/content/globals/<name>`). Several → an "Edit" dropdown with one entry each. None → hidden.
- `live-edit`: a link to `<admin>/presentation?url=<current page>`. In a preview tab it is the on-page edit switch
  (`data-cms-edit`), and a `mode` message from the admin updates it.
- `perspective`: the Drafts / Published menu, as in the admin's app bar. It reads the `integral-preview` cookie and calls
  `setPerspective()`, which reloads. The bar renders it itself: hooks MAY move or drop it, not restyle it.
- `exit-preview`: preview tab only. The server does not know the page is a preview tab, so the client adds it
  (`fillItems()`). Clears `window.name` and reloads.
- Built-ins use `order` 10, 20, 30, 40. Host items without `order` follow them in insertion order.

Below 640 px, the `start` group stays in the bar and the `end` group moves into a `Sheet` that opens from the right
through a hamburger button. Dropdowns render as nested lists there.

Keyboard: the bar is a reka `ToolbarRoot` with roving focus. It is one tab stop; arrow keys move between items, and
`Home` / `End` jump to the first and last one.

## Item model

```ts
type AdminBarItem = {
  /** Unique. A later item with the same id replaces the earlier one. */
  id: string;
  /** Defaults to `"end"`. */
  group?: "start" | "end";
  /** Sort key within the group. */
  order?: number;
  label: string;
  icon?: IconName;
  /** A link, or `onClick` (client items only), or `children` (a dropdown). */
  href?: string;
  onClick?: () => void;
  children?: AdminBarItem[];
};
```

It lives in `packages/core/src/admin/index.d.ts` next to `Nav` and `IconName`. Server items MUST be JSON:
`ServerAdminBarItem` is the same shape with `onClick?: never` and `ServerAdminBarItem[]` children.

Composition order: built-ins, then server hooks (plugins in order, then the host), then `addAdminBarItem()` calls.
A hook gets the whole list and returns a new one, so it can add, replace, reorder or drop items. The server cannot see
the page, so built-ins reach it as stubs (`id`, `group`, `order`, `label`); the client fills `dashboard`, `edit` and
`live-edit` into whatever stubs remain, keeping their `group` and `order`. The bar renders `perspective` itself.

## Architecture

```
site page
 └─ preview() (vanilla, as today)
     ├─ iframe mode ─────────────────▶ live preview, no bar
     └─ preview tab, or the `integral-session` hint cookie
          └─ GET /api/cms/admin-bar?url=<page>   (session middleware)
               → { position, items } | 401 → nothing (a 401 clears the hint)
          └─ import("integral-cms/admin/bar")      (Vue chunk, split by the host bundler)
               └─ mountAdminBar(shadowRoot, ctx) → { update, unmount }
```

- **Hint cookie.** The session cookie is `HttpOnly`, so page code cannot see it. A middleware on the auth route
  mirrors better-auth's session cookie in each response: set → `integral-session=1` (not `HttpOnly`, `Lax`, path
  `/`), cleared → cleared. It grants nothing; the endpoint checks the real session.
- **Endpoint.** `GET /admin-bar` is a protected route (`preview/endpoints/admin-bar.endpoint.ts`). It runs the hooks
  with `{ user, cms, url }` and answers `{ position, items }`. `url` is a string and is never fetched. A throwing hook
  is logged and skipped, so one broken plugin does not hide the bar. With `adminBar: false` the route is not mounted.
- **Bundle.** `packages/admin` gets a second Vite lib entry, `src/admin-bar/index.ts`, built to
  `packages/core/dist/admin/bar.js` with Vue and its CSS inlined. Core exports it as `integral-cms/admin/bar`, typed
  by a hand-written `src/admin/bar.d.ts`. The runtime imports it dynamically inside the browser-only branch, so server
  bundles never execute it.
- **Contract.** `mountAdminBar(el, ctx)` follows the admin's `Mount` pattern. The runtime owns all state and logic;
  the bar renders `ctx` and calls its actions.

```ts
type AdminBarContext = {
  position: "top" | "bottom";
  mode: "site" | "preview-tab";
  items: AdminBarItem[];
  perspective: "drafts" | "published";
  edit: boolean;
  setPerspective(p: "drafts" | "published"): void;
  setEdit(edit: boolean): void;
};
```

- **Isolation.** The bar mounts into a shadow root on `<html>`, outside `<body>`, so host CSS cannot reach it and a
  morph keeps it. It overlays the page; the `margin-top` on `<html>` goes away.
- **Portals.** `AdminBar.vue` wraps the bar in reka's `ConfigProvider :teleport-to`, pointed at an element inside the
  shadow root. Every reka portal below it (dropdown, sheet) lands there. The shadcn components and the admin are
  unchanged.
- **Styles.** Tailwind v4 with `source(none)` and `@source` on the bar and the shared UI it uses. Theme variables live
  in `shared/theme.css` on `:root, :host`. Chrome ignores `@property` in shadow roots, so the `unwrap-properties`
  PostCSS plugin in `vite.config.ts` unwraps Tailwind's `@layer properties` fallbacks. Chrome also ignores
  `@font-face` there, so the bar uses system fonts. One wrapper with `all: initial` stops inherited host styles.
- **Dark mode.** The bar follows `prefers-color-scheme` through a `dark` class on its wrapper. It cannot read the
  admin's choice, which is stored per origin.
- **Headroom.** A pure `headroom(state, scrollY)` in `packages/admin/src/admin-bar/headroom.ts`, tested by the admin's Vitest: hidden after scrolling down more than the bar height, shown on any scroll up, always shown
  near the top of the page and while focus or a menu is inside the bar. A bottom bar slides down instead of up.

## Admin changes

- `/presentation?url=<page>` loads that page in the preview, if it is on the site origin (`safe()` in `Preview.vue`).
- `useToolbar()` → `useAppBar()` and matching names in `shared/layouts/default.vue` and CLAUDE.md.

## Removed

- `preview/runtime/bars.ts` and the `[data-cms-bar]` CSS. `setEditMode()` no longer queries the bar's input; it
  updates `ctx.edit`.
- The `integral-preview` cookie no longer gates the bar; the hint cookie does. It still selects the perspective.

## Errors

- No hint cookie and no preview tab: no request, no bar.
- 401: no bar, the hint is cleared. Network error or other status: no bar, the hint stays.
- A failed chunk import: no bar, logged with `console.warn`.
- The bar never calls the server itself, except through `setPerspective()`.

## Testing

- Integration `src/tests/admin-bar.test.ts`: 401 without a session; built-in stubs with defaults; plugin hooks run
  before the host hook; a throwing hook is skipped and logged; `position`; `adminBar: false` answers 404 with a
  session; sign-in sets the hint cookie and sign-out clears it.
- Unit: `composeItems()` (replace by id, groups, sort, insertion order, removal), `headroom()`.
- `preview.test.ts`: no fetch without the hint; no import after a 401; `addAdminBarItem()` before and after mount.
- Manual, in the Astro example: light and dark, top and bottom, mobile sheet, keyboard (one tab stop, arrows),
  dropdown and sheet inside the shadow root, morph after save, a preview tab.

## Out of scope

- Per-user bar position or hidden items.
- Server items with actions other than links.
- Component tests for the bar.
