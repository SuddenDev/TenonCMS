# cli

The `tenon` bin of `tenoncms` (also `tenoncms`): `backup`, `restore`, `upgrade`, `login` and `logout`. The guide is [The CLI](../../../../docs/guide/cli.md). Scaffolding is the separate `create-tenoncms` package.

It is its own build entry (`dist/cli/index.mjs`), so no host bundle includes it. It runs the host's `vite`, an optional peer dependency, and imports only what the package exports: the client, `readArchiveManifest()` and the archive types from `client/`, and `clientModules()` from `integrations/vite/`.

## Follow a backup

`index.ts` → `backup.command.ts` → `target.ts` → `cms.export()` or `client.exportLink()`

`index.ts` parses flags with `node:util` `parseArgs` (`allowNegative`, so `--no-media`) and runs one command. `openTarget()` picks the target once:

- `--url` (or `TENON_URL`): `createClient()` over HTTP. Its `fetch` adds `x-api-key` (`--api-key`, `TENON_API_KEY`) or `Authorization: Bearer` with the session of `tenon login`, only for that origin, so presigned storage URLs get no second credential.
- Without a URL: Vite's `runnerImport()` loads `tenon.config.ts` like a server build. `clientModules({ server: true })` transforms `.client` modules, and `astro:env/*` becomes `process.env` over the defaults of `env.schema` in `astro.config.*`. `.env` fills `process.env` first. Next to a `nuxt.config.*`, `nuxt-runtime-config.ts` loads it with `loadNuxtConfig()` of `@nuxt/kit` and sets a global `useRuntimeConfig()`: its `runtimeConfig` with the `NITRO_*` and `NUXT_*` variables over it, by Nitro's rule. A config that imports `cloudflare:*` fails with a hint to use `--url`.

A backup is a `full` archive unless `--content-only`. It writes `<file>.part` and renames it, so a failed download leaves no file.

## Follow a restore

`restore.command.ts` reads the manifest locally (`readArchiveManifest()` on `openAsBlob()`), then checks: locally `cms.import(…, { dryRun: true })`, over HTTP `POST /import/check` with the manifest alone. Errors stop it before any question. Then it warns, offers a backup, asks with a default of No, and restores with `mode: "replace"`. Without a terminal it needs `--yes`.

## Files

| File                     | Role                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| `index.ts`               | Node check, flags, help, dispatch, exit codes                               |
| `target.ts`              | `openTarget()`: local config or HTTP, and the archive download              |
| `credentials.ts`         | Sessions per origin in `$XDG_CONFIG_HOME/tenon/credentials.json` (mode 600) |
| `nuxt-runtime-config.ts` | `useRuntimeConfig()` for a Nuxt config: `@nuxt/kit`, then `applyEnv()`      |
| `ui.ts`                  | Counts, bytes, file names, `answer()`, `spinning()`, `canAsk()`             |
| `backup.command.ts`      | `tenon backup`                                                              |
| `restore.command.ts`     | `tenon restore`                                                             |
| `login.command.ts`       | `tenon login` (device flow, RFC 8628 polling) and `tenon logout`            |
| `upgrade.command.ts`     | `tenon upgrade`: npm registry, lockfile, `<pm> add`                         |
