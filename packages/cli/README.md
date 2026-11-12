# @tenoncms/cli

The `tenon` bin: `backup`, `restore`, `upgrade`, `login` and `logout`. The guide is [The CLI](../../docs/guide/cli.md). Scaffolding is the separate `create-tenoncms` package, which adds this one to every project.

`tenoncms` and `vite` are peer dependencies, so the CLI always runs the host's own versions. It imports only public exports: `tenoncms/client` (the client, `readArchiveManifest()`, the archive types) and `clientModules` from `tenoncms/vite`. Releases keep the same version as `tenoncms`.

## Follow a backup

`index.ts` → `backup.command.ts` → `target.ts` → `cms.export()` or `client.exportLink()`

`index.ts` parses flags with `node:util` `parseArgs` (`allowNegative`, so `--no-media`) and runs one command. `openTarget()` picks the target once:

- `--url` (or `TENON_URL`): `createClient()` over HTTP. Its `fetch` adds `x-api-key` (`--api-key`, `TENON_API_KEY`) or `Authorization: Bearer` with the session of `tenon login`, only for that origin, so presigned storage URLs get no second credential.
- Without a URL: Vite's `runnerImport()` loads `tenon.config.ts` like a server build. `clientModules({ server: true })` transforms `.client` modules, and `astro:env/*` becomes `process.env` over the defaults of `env.schema` in `astro.config.*`. `.env` fills `process.env` first. A config that imports `cloudflare:*` fails with a hint to use `--url`.

A backup is a `full` archive unless `--content-only`. It writes `<file>.part` and renames it, so a failed download leaves no file.

## Follow a restore

`restore.command.ts` reads the manifest locally (`readArchiveManifest()` on `openAsBlob()`), then checks: locally `cms.import(…, { dryRun: true })`, over HTTP `POST /import/check` with the manifest alone. Errors stop it before any question. Then it warns, offers a backup, asks with a default of No, and restores with `mode: "replace"`. Without a terminal it needs `--yes`.

## Files

| File                 | Role                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| `index.ts`           | Node check, flags, help, dispatch, exit codes                               |
| `target.ts`          | `openTarget()`: local config or HTTP, and the archive download              |
| `credentials.ts`     | Sessions per origin in `$XDG_CONFIG_HOME/tenon/credentials.json` (mode 600) |
| `ui.ts`              | Counts, bytes, file names, `answer()`, `spinning()`, `canAsk()`             |
| `backup.command.ts`  | `tenon backup`                                                              |
| `restore.command.ts` | `tenon restore`                                                             |
| `login.command.ts`   | `tenon login` (device flow, RFC 8628 polling) and `tenon logout`            |
| `upgrade.command.ts` | `tenon upgrade`: npm registry, lockfile, `<pm> add`                         |
