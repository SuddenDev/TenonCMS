# tests

Integration tests. Each file sets up a real `defineCms()` on in-memory libsql and talks to it through `createClient()`, the same way the browser does.

- `setup.ts`: the shared schema, `fresh()` (instance, client, signed-in fetch), `relational()`, `seed()`, and `withMedia()` (an instance with `local()` in a temp dir and 1 KB parts).
- `fixtures.ts`: tiny images for header and rendering tests.
- One file per area: `auth`, `writes`, `reads`, `refs`, `populate`, `on-delete`, `hooks`, `root-hooks`, `plugins`, `fields`, `presets`, `media`, `localization` (the public config route) and `locales` (scope, reads, writes, drafts, fallback, population, integrity, copy and remove, schema moves, HTTP).

Unit tests for pure functions live next to their file as `*.test.ts`. Run one with `npx vitest run <file> -t '<name>'`.
