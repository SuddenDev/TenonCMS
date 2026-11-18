# cli

The `tenon` bin of `tenoncms` (also `tenoncms`): `backup`, `restore`, `upgrade`, `login`, `logout`, `users` and `media`. The guide is [The CLI](../../../../docs/guide/cli.md). Scaffolding is the separate `create-tenoncms` package.

It is its own build entry (`dist/cli/index.mjs`), so no host bundle includes it. It runs the host's `vite`, an optional peer dependency, and imports mostly what the package exports: the client, `readArchiveManifest()` and the archive types from `client/`, and `clientModules()` from `integrations/vite/`. `commands/users.command.ts` also imports two internal files with no server code: `translate()` from [admin/browser/text.ts](../admin/browser/text.ts) and `BUILT_IN_ROLES` from [users/roles.ts](../users/roles.ts).

## Follow a backup

`index.ts` → `commands/backup.command.ts` → `target.ts` → `cms.export()` or `client.exportLink()`

`index.ts` parses flags with `node:util` `parseArgs` (`allowNegative`, so `--no-media`) and runs one command. `openTarget()` picks the target once:

- `--url` (or `TENON_URL`): `createClient()` over HTTP. Its `fetch` adds `x-api-key` (`--api-key`, `TENON_API_KEY`) or `Authorization: Bearer` with the session of `tenon login`, only for that origin, so presigned storage URLs get no second credential.
- Without a URL: Vite's `runnerImport()` loads `tenon.config.ts` like a server build. `clientModules({ server: true })` transforms `.client` modules, and `astro:env/*` becomes `process.env` over the defaults of `env.schema` in `astro.config.*`. `.env` fills `process.env` first. Next to a `nuxt.config.*`, `nuxt-runtime-config.ts` loads it with `loadNuxtConfig()` of `@nuxt/kit` and sets a global `useRuntimeConfig()`: its `runtimeConfig` with the `NITRO_*` and `NUXT_*` variables over it, by Nitro's rule. A config that imports `cloudflare:*` fails with a hint to use `--url`.

A backup is a `full` archive unless `--content-only`. It writes `<file>.part` and renames it, so a failed download leaves no file.

## Follow a restore

`commands/restore.command.ts` reads the manifest locally (`readArchiveManifest()` on `openAsBlob()`), then checks: locally `cms.import(…, { dryRun: true })`, over HTTP `POST /import/check` with the manifest alone. Errors stop it before any question. Then it warns, offers a backup, asks with a default of No, and restores with `mode: "replace"`. Without a terminal it needs `--yes`.

## Follow a recovery

`commands/users.command.ts` → `target.ts` `loadConfig()` → `cms.users.signInLink()`

`users recover` refuses `--url`: it needs the database, not a session, so it works when nobody can sign in. `users create` invites with `cms.users.invite()`, or with `--url` through `client.invites.create()` and the session of `tenon login`; `--password` calls `cms.users.create()`. The server builds the invite page from `admin.path`. The site's origin is `configuredOrigin()` of better-auth's `baseURL` (a string when `auth.baseURL` or `site.url` is set), else a question; only then does `users create` pass the page itself, from the answer and `cms.adminPath`.

`tenon login` opens the `verification_uri_complete` the server sends, which is `<admin.path>/device`. A 404 for the device code means the site has no device login (`admin: false`). `deliveryNote()` says whether the link was emailed; the link is printed either way.

`users list`, `deactivate`, `reactivate` and `remove` call the same-named `cms.users` methods, and refuse `--url` like `recover` (`localOnly()`). Deactivate and remove confirm first unless `--yes`; remove defaults to No. `formatUsers()` prints the list as a table and colors the status when `stdout.hasColors()`. The role prompt of `users create` is a select of `roleOptions()`: `cms.users.roles()` locally, the `roles` of `GET /schema` with `--url`. These commands and `--password` need no `site.url`; only a link does.

## Follow a regenerate

`commands/media.command.ts` → `target.ts` `loadConfig()` → `cms.media.regenerate()`

`media regenerate` refuses `--url`, like the local `users` commands: it renders with the project's provider and storage. `--force` passes `force: true`. `regenerateReport()` turns the counts into the spinner's message, plus a hint when images without a provider lack admin previews.

## Files

| File                          | Role                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `index.ts`                    | Node check, flags, help, dispatch, exit codes                                 |
| `target.ts`                   | `openTarget()`, `loadConfig()`, `remoteClient()`, the archive download        |
| `credentials.ts`              | Sessions per origin in `$XDG_CONFIG_HOME/tenon/credentials.json` (mode 600)   |
| `nuxt-runtime-config.ts`      | `useRuntimeConfig()` for a Nuxt config: `@nuxt/kit`, then `applyEnv()`        |
| `ui.ts`                       | Counts, bytes, file names, `answer()`, `spinning()`, `canAsk()`               |
| `commands/backup.command.ts`  | `tenon backup`                                                                |
| `commands/restore.command.ts` | `tenon restore`                                                               |
| `commands/login.command.ts`   | `tenon login` (device flow, RFC 8628 polling) and `tenon logout`              |
| `commands/upgrade.command.ts` | `tenon upgrade`: npm registry, lockfile, `<pm> add`                           |
| `commands/users.command.ts`   | `tenon users create`, `list`, `recover`, `deactivate`, `reactivate`, `remove` |
| `commands/media.command.ts`   | `tenon media regenerate`, `regenerateReport()`                                |
