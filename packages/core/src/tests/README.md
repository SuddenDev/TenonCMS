# tests

Integration tests. Each file sets up a real `defineCms()` on in-memory libsql and talks to it through `createClient()`, the same way the browser does. The Vitest projects `pglite` and `sqlite` run them again on PGlite and `node:sqlite` (`CMS_TEST_DB=pglite` / `sqlite`, only in `pnpm test:full`): use `testDatabase()` for a fresh database and `testDb()` for one that instances share, with `exec()` for raw SQL. Raw SQL that differs per dialect branches on `onPglite`.

- `setup.ts`: the shared schema, `fresh()` (instance, client, signed-in fetch), `relational()`, `seed()`, and `withMedia()` (an instance with `local()` in a temp dir and 1 KB parts).
- `fixtures.ts`: tiny images for header and rendering tests.
- `jobs-setup.ts`: the job fixture of `jobs` and `cron`: the tasks `greet` and `boom`, `jobsCms()`, `onFile()` and `resetJobs()`.
- One file per area, named after it (`access`, `drafts`, `media`, `webhooks` and so on; list the folder). Less obvious ones: `items` (array and blocks fields), `localization` (the public config route) next to `locales` (localized content), `refs` and `on-delete` (reference integrity), `conflicts` (edit tokens), `read-admission` (who MAY read before loading), `invites` (a temp file DB, so a test can expire or read rows) and `schedule-lock` (a scheduled publish needs and locks its draft).
- `durable-object.workerd.test.ts` runs in workerd, inside the Worker of `workerd/`.

Unit tests for pure functions live next to their file as `*.test.ts`. Run one with `npx vitest run --project node <file> -t '<name>'`.
