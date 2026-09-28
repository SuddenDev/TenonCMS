# tests

Integration tests. Each file sets up a real `defineCms()` on in-memory libsql and talks to it through `createClient()`, the same way the browser does.

- `setup.ts`: the shared schema, `fresh()` (instance, client, signed-in fetch), `relational()` and `seed()`.
- One file per area: `auth`, `writes`, `reads`, `refs`, `populate`, `on-delete`, `hooks`, `root-hooks`, `plugins`, `fields`, `presets`.

Unit tests for pure functions live next to their file as `*.test.ts`. Run one with `npx vitest run <file> -t '<name>'`.
