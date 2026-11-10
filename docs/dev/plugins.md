# Plugins

Published plugins may author typed `.client` imports and use the exported `clientModules({ server: true, references })` build plugin to emit literal references to public package exports. Server and browser entries MUST be built separately, and `tenoncms/admin` MUST remain external in the server build. See the guide’s typed-import packaging example.
Code: `packages/core/src/plugins/` for the contract, `packages/plugins/` for the bundled plugins.

## The contract

A plugin is a plain object. It can bring collections, globals, hooks, media hooks, routes, middleware and admin registrations (fields, pages, bar items, rich text extensions). A plugin can also have no schema at all.

- Plugin names use `[a-z0-9-]`. Reserved: `account`, `admin`, `auth`, `auth-status`, `collections`, `globals`, `invites`, `jobs`, `localization`, `media`, `preview`, `schema`.
- Plugin collections and globals merge into the schema before it is checked. A name the host or another plugin already uses throws. Admin options merge after that: plugins first, then the host.
- Hooks stay with the plugin. They run after the collection's own hooks and before root hooks.
- `jobs: { tasks, scheduledTasks }` has the shape of the host's option without `secret`. A task name MUST start with `<plugin.name>:`, and `scheduledTasks` MAY name the plugin's own tasks only. `resolveJobs()` merges built-in tasks (`tenon:`), then plugins in their order, then the host, and a duplicate name throws, like a duplicate collection. A plugin task is admin-only unless it sets `access`. See [jobs](../../packages/core/src/jobs/README.md).

## Routes

- **Public** routes and middleware run before CSRF and session checks. They MUST protect their own writes.
- **Protected** routes get the session user and a scoped `cms`.

## Bundled plugins

They are built like a third-party plugin would be, on purpose.

- They import `tenoncms` by package name and so can only use public exports. A declaration build error there means a public type is missing.
- The build keeps bare imports external, except Vue, React and `tenoncms/admin/vue|react`, which are bundled. Tests and typechecks use core's source through aliases, so they need no build.
- Their admin half ships **compiled**, because the host may not compile `.vue` or JSX. Vue and React are bundled into the plugin's own chunks.
- Plugin CSS applies to the whole admin page. Scope every selector (a page class, scoped styles, or a prefixed Tailwind). Do not rely on the admin's Tailwind utilities; only `.input` and `.btn` are shared.
- Browser strings live in the plugin's own message files, with English as the fallback. Schema labels are inline `{ en, de }`.
- Code the admin bar reaches must contain no CSS. A plugin that renders a bar item has a separate bar entry for this.

## `redirects` and `example`

- `redirects` keeps redirects in sync with path changes, offers import and a public lookup, and exposes a helper for host middleware. The locale of a redirect is a plain optional field.
- `example` is a starting point to copy. It uses every plugin option once, and its browser code exists three times (plain DOM, Vue, React). Keep its comments minimal: the code is the documentation.
