# The CLI

Two commands: `npm create tenoncms` starts a project, and `tenon` backs it up, restores it and upgrades it. Both need Node 24 or newer.

`tenon` comes with the `tenoncms` package, so every project that has `tenoncms` has it: `npx tenon backup`. `npx tenoncms backup` is the same command. Remove `@tenoncms/cli` if a project still has it; it was the old home of the command.

## Create a project

```sh
npm create tenoncms
```

It asks one question at a time: the folder, the framework (Astro, Nuxt, TanStack Start or standalone), the template, where it will run, the database, where media files go, the package manager, and whether to install dependencies and start a git repository. The database and media questions offer only what works where the site runs, and a question with one answer is skipped. The first answer is the default.

| Runs on                 | Database                                                                                | Media                                |
| ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| Node                    | SQLite / Turso (libSQL: a local file, or Turso by URL), Postgres, PGlite, `node:sqlite` | Local disk (`./.uploads`), S3 bucket |
| Vercel                  | SQLite / Turso (a file in development, Turso on Vercel), Postgres                       | S3-compatible bucket                 |
| Cloudflare (Astro only) | Durable Object                                                                          | R2, images through Cloudflare Images |

Every question has a flag, so it also runs without a terminal:

```sh
npm create tenoncms my-site -- --framework nuxt --target node --database postgres --storage s3 --pm pnpm --yes
```

It writes the database, media and secret straight into `tenon.config.ts`, the adapter and env schema into `astro.config.ts` (Astro), and the variables they read into `.env.example`. `.env` (`.dev.vars` on Cloudflare) is a copy with a random `CMS_SECRET`. Fill in what it says, run `dev`, open `/admin` and create the first admin.

## Back up

```sh
npx tenon backup
```

It shows what the backup will hold, suggests a file name like `tenon-my-site-2026-11-12-1530.zip`, and writes it. The backup is a [full backup](./backup.md#full-backup): content, versions, media files, users, API keys and jobs.

- `--dry-run` shows the counts and the file name, and writes nothing.
- `--out <file>` sets the name without asking. `--yes` takes the suggestion.
- `--content-only` leaves users and API keys out. `--no-media` leaves the media files out.

## Restore

```sh
npx tenon restore tenon-my-site-2026-11-12-1530.zip
```

It checks the backup first and shows what it deletes and what it writes. Then it offers to back up the current data, and asks once more. **A restore replaces all data, users included, and cannot be undone.** Everyone is signed out.

- `--dry-run` stops after the check.
- `--yes` skips the questions; it is required without a terminal. `--backup` backs up first anyway.
- A full backup restores only into the same kind of database and the same `tenoncms` version. The check says what differs.

## Local or remote

Without `--url`, the CLI loads `tenon.config.ts` and opens the database itself, like your dev server. That works for SQLite, Postgres and PGlite. A Cloudflare config only runs on Cloudflare, so use `--url` there.

With `--url`, it talks to a running instance, local or deployed:

```sh
npx tenon login https://example.com
npx tenon backup --url https://example.com
```

`tenon login` asks for the URL if you give none. It shows a code and opens the admin, where a signed-in user approves it. Backups of the local project (no `--url`) need no login. The session is stored per site in `~/.config/tenon/credentials.json` and lasts as long as a normal session (7 days, renewed on use). `tenon logout <url>` ends it. If your admin is not at `/admin`, pass `--admin <path>`; `--no-open` prints the link instead of opening it.

For CI, create an API key with the **Backup** permission instead (`read` to back up, `update` to restore) and pass it as `TENON_API_KEY` or `--api-key`. `TENON_URL` replaces `--url`.

Only admins and keys with that permission can back up or restore.

## Upgrade

```sh
npx tenon upgrade
```

It compares the installed `tenoncms` with the latest version on npm and installs it with your package manager after a confirm. Below 1.0, a new minor version MAY break things: read the release notes. `--dry-run` only shows the command.
