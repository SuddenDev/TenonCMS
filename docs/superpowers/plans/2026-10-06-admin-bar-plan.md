# Plan: Admin bar

Spec: `docs/superpowers/specs/2026-10-06-admin-bar-design.md`.

Paths are relative to the repo root. Commands:

- One test: `npx vitest run <file> -t '<name>'` in `packages/core`. No build needed.
- Types: `pnpm -r typecheck` while a watcher runs, else `pnpm typecheck`.
- Before done: `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

Every core task is RED then GREEN. Admin tasks are checked with `pnpm typecheck` and by hand in the Astro example
(Task 10).

## Starting point

- `preview/runtime/preview.ts`: `preview()` → `startLive()` or `startAdminBar()`. `startAdminBar()` checks
  `hasSession()` and calls `adminBar(admin)` from `runtime/bars.ts`; `startLive()` calls `previewBar()` in a preview
  tab. `setEditMode()` sets the bar's checkbox through `querySelector`.
- `runtime/site-api.ts`: `API`, `hasPreviewCookie()`, `perspective()`, `hasSession()`, `setPerspective()`.
- `http/app.ts`: `providerEndpoint(core)` (better-auth) mounts before CSRF/session; `writes` holds protected routes.
- Plugins: `plugins/types.ts` (`Plugin`), merged in `cms/create-cms.ts` (`mergePlugins()`).
- `CmsOptions` in `cms/config/options.ts`.
- `src/admin/index.d.ts` holds `Nav`, `Mount`, `IconName` import; copied to `dist/admin` by `tsdown.config.ts`.
  `src/admin/menu.ts` is the model for an import-free helper the admin bundles.
- `packages/admin/vite.config.ts`: one lib entry `src/index.ts` → `dist/admin/index.js`, CSS via `?inline`.
- shadcn components with portals: `dropdown-menu/DropdownMenuContent.vue`, `sheet/SheetContent.vue`,
  `tooltip/TooltipContent.vue`, `dialog/DialogContent.vue` (+ `DialogScrollContent.vue`, `AlertDialogContent.vue`).
- `Preview.vue` opens on `siteUrl()`; `safe()` validates URLs.

## Decisions

- **Folder.** Core: `preview/runtime/admin-bar.ts` (start, mount, update), `preview/runtime/admin-bar-items.ts`
  (`builtIns()`, `composeItems()`, `addAdminBarItem()` registry), `preview/endpoints/admin-bar.endpoint.ts`,
  `preview/config/admin-bar.ts` (option types and `runItemHooks()`). Admin: `packages/admin/src/admin-bar/`
  (`index.ts` with `mountAdminBar`, `AdminBar.vue`, `AdminBarItem.vue`, `AdminBarSheet.vue`, `style.css`).
- **Hint cookie** in `auth/middleware/session-hint.middleware.ts`, mounted on the auth route. It reads the response's
  `Set-Cookie` for better-auth's session cookie name (from `auth.options`/`getCookies`), not a hard-coded string.
- **Types.** `AdminBarItem`, `AdminBarContext` in `src/admin/index.d.ts`; `src/admin/bar.d.ts` declares
  `mountAdminBar`. `preview/config/types.ts` imports them with `import type`, like `schema` imports `Nav`.
- **Roving focus** through reka `ToolbarRoot` / `ToolbarButton` / `ToolbarLink` / `ToolbarSeparator`, with
  `as-child` around `DropdownMenuTrigger` and `SheetTrigger`. Two `ToolbarRoot`s are not used: one root holds both
  groups, a spacer separates them.

## Task 1: Spike (throwaway) (done)

In `packages/admin`, a scratch entry mounts a `ToolbarRoot` with a `DropdownMenu`, a `Sheet` and a `Switch` into a
shadow root on a plain HTML page. Check: Tailwind utilities and tokens apply (`:host` vars), dark class works, the
dropdown and sheet portal into the shadow root, outside click and `Escape` close them, focus returns, arrow keys
move. Record which `@property` utilities break. Decide Tailwind vs plain CSS (spec "Styles"). Delete the scratch
files.

## Task 2: Types and option (done)

Tests in `src/schema/types.test.ts` (or a new block in `inference.test.ts`):

- `defineCms({ adminBar: { position: "bottom", items: (items) => items } })` compiles; `adminBar: false` compiles.
- `@ts-expect-error` on `position: "left"` and on an item with `onClick` returned from a server hook.
- `definePlugin({ name: "x", adminBar: { items: (i) => i } })` compiles.

Code: `AdminBarItem`, `AdminBarContext` in `src/admin/index.d.ts` with JSDoc on every property; server items type
`ServerAdminBarItem = Omit<AdminBarItem, "onClick" | "children"> & { onClick?: never; children?: ServerAdminBarItem[] }`;
`AdminBarOptions` in `preview/config/admin-bar.ts`; `adminBar?` on `CmsOptions` and `Plugin`. Add `bar.d.ts` to
tsdown `copy`.

## Task 3: Item composition (done)

Tests in `preview/runtime/admin-bar-items.test.ts`:

- `builtIns(mode)`: ids and orders; `exit-preview` only for `preview-tab`.
- `composeItems(list, added)`: a later id replaces an earlier one in place; sort by group then `order`; items without
  `order` keep insertion order after ordered ones; `children` pass through.
- `addAdminBarItem()` returns a remover; `subscribeItems()` listeners fire on add and remove.

Code: `admin-bar-items.ts`. Export `addAdminBarItem` from `preview/index.ts`.

## Task 4: Endpoint (done)

Tests in `src/tests/admin-bar.test.ts`, with `fresh()`:

- 401 without a session.
- With a session: `{ position: "top", items }` with the built-in stubs.
- `position: "bottom"` comes through.
- A plugin hook runs before the host hook (the host sees the plugin's item).
- A throwing hook is skipped; `process.stderr.write` gets the error (consola gotcha); the other hooks still run.
- `url` from the query reaches the hook.
- `adminBar: false`: 404 with a session.

Code: `runItemHooks()` in `preview/config/admin-bar.ts`, `admin-bar.endpoint.ts`, mounted in `writes` in
`http/app.ts` after `exitEndpoint()`.

## Task 5: Hint cookie (done)

Tests in `src/tests/admin-bar.test.ts` (or `auth.test.ts`):

- Sign-up and sign-in responses set `integral-session=1`, not `HttpOnly`.
- Sign-out clears it.
- Responses without a session cookie leave it alone.

Code: `session-hint.middleware.ts` on the auth route in `http/app.ts`.

## Task 6: Runtime (done)

Tests in `preview/runtime/preview.test.ts` (mock `fetch` and the dynamic import with `vi.mock("integral-cms/admin/bar")`
or an injectable loader):

- No hint cookie, no preview tab: no fetch.
- Hint cookie: fetches `/api/cms/admin-bar?url=…`; on 200 mounts with `position`, filled `edit` (one document →
  link; two → children), `perspective` from the cookie.
- 401: no mount, the hint is cleared.
- Preview tab: mounts with `mode: "preview-tab"`; a `mode` message calls `update` with `edit`.
- `addAdminBarItem()` after mount calls `update` with the item; its remover removes it.
- `stop()` unmounts and removes the shadow host.

Code: `runtime/admin-bar.ts` (`startAdminBar(mode, admin)`): fetch, compose, shadow host on `<html>`, dynamic import,
`mount`, `update` on bound document changes (`DOMContentLoaded` and the live observer), on `mode` messages and on
`addAdminBarItem()`. `site-api.ts`: `hasSessionHint()`, `clearSessionHint()`, `loadAdminBar(url)`; drop
`hasSession()`. `preview.ts`: the admin-bar branch checks the hint instead of the preview cookie; `startLive()` calls
`startAdminBar("preview-tab", admin)` in a preview tab; `setEditMode()` goes through the bar's state. Delete
`runtime/bars.ts`.

## Task 7: Headroom (done)

Tests in `src/admin/headroom.test.ts`: shown at the top; hidden after scrolling down past the height; shown on any
scroll up; stays shown while `pinned` (focus or open menu); small jitter below a threshold changes nothing.

Code: `src/admin/headroom.ts`, no imports.

## Task 8: Admin bar UI (done)

- `vite.config.ts`: `lib.entry: { index: "src/index.ts", bar: "src/admin-bar/index.ts" }`. Check that `index.js` and
  `bar.js` both build, shared chunks land in `dist/admin`, and the admin still mounts.
- Portals: `ConfigProvider :teleport-to` in `AdminBar.vue` (no `portalTargetKey`; the shadcn components stay as they are).
- `src/admin-bar/`: `mountAdminBar(el, ctx)` creates the shadow content, injects CSS, provides the portal target,
  watches `prefers-color-scheme`, and returns `{ update, unmount }`. `AdminBar.vue`: `ToolbarRoot` with the `start`
  group, a spacer, the `end` group (inline from `sm`), a hamburger opening `AdminBarSheet.vue` (side `right`) below
  `sm`; headroom through `headroom()` with `pinned` while focus or a menu is inside; `position` puts it at top or
  bottom. `AdminBarItem.vue` renders link, button, dropdown, the `perspective` switch and the `live-edit` switch.
- `package.json` exports `./admin/bar` (types `dist/admin/bar.d.ts`, default `dist/admin/bar.js`).

## Task 9: Admin changes (done)

- `Preview.vue`: initial `url` from `route.query.url` through `safe()`. Check the iframe opens on that page.
- Rename `useToolbar()` → `useAppBar()` and its uses.

## Task 10: Docs and manual check (docs done; manual check open)

- `preview/README.md`: replace "Modes and bars" with the admin bar flow, files table (`admin-bar.ts`,
  `admin-bar-items.ts`, endpoint, no `bars.ts`), the hint cookie. `auth/README.md`: the hint middleware.
- `CLAUDE.md`: preview paragraph, admin entry (`src/admin-bar/`, second lib entry, `ConfigProvider` portals), `useAppBar()`,
  `headroom.ts`, the `./admin/bar` export, and a gotcha from the spike if one shows up.
- README.md: the `adminBar` option and `addAdminBarItem()`, with JSDoc on every option.
- Manual, Astro example with a temp DB (see memory: isolated smoke tests): sign in, visit a page: bar shows; light,
  dark; top and bottom; one and several bound documents; keyboard (one tab stop, arrows, `Escape`); mobile sheet;
  headroom; drafts/published switch; Live Edit opens presentation on the page; a preview tab gets the edit switch and
  Exit; signed out: no request in the network panel.
