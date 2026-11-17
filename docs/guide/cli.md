# The CLI

Two commands: `npm create tenoncms` starts a project, and `tenon` backs it up, restores it, upgrades it and manages its users. Both need Node 24 or newer.

`tenon` comes with the `tenoncms` package, so every project that has `tenoncms` has it: `npx tenon backup`. `npx tenoncms backup` is the same command. Remove `@tenoncms/cli` if a project still has it; it was the old home of the command.

## Create a project

```sh
npm create tenoncms
```

It asks one question at a time: the folder, the site name (default `Tenon`, written to `site.name` in `tenon.config.ts`), the framework (Astro, Nuxt, TanStack Start or standalone), the template, where it will run, the database, where media files go, how people sign in to the admin, the package manager, and whether to install dependencies and start a git repository. The database and media questions offer only what works where the site runs, and a question with one answer is skipped. The first answer is the default.

| Runs on                 | Database                                                                                | Media                                |
| ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| Node                    | SQLite / Turso (libSQL: a local file, or Turso by URL), Postgres, PGlite, `node:sqlite` | Local disk (`./.uploads`), S3 bucket |
| Vercel                  | SQLite / Turso (a file in development, Turso on Vercel), Postgres                       | S3-compatible bucket                 |
| Cloudflare (Astro only) | Durable Object                                                                          | R2, images through Cloudflare Images |

Sign-in offers any mix of password (the default), passkey, magic link and email code. At least one is required. See [Sign-in methods](./auth-and-access.md#sign-in-methods).

- Password alone writes nothing: it is core's default. Without password, `tenon.config.ts` gets `emailAndPassword: { enabled: false }`.
- Passkey adds `@better-auth/passkey` to `package.json` and its plugin to `tenon.config.ts`.
- Magic link and email code add `magicLink()` and `emailOTP()` from `tenoncms/auth`. They need [email](./email.md), which the scaffolder does not set up. Until then, `npx tenon users recover <email>` prints a sign-in link.

Every question has a flag, so it also runs without a terminal:

```sh
npm create tenoncms my-site -- --site-name "My Site" --framework nuxt --target node --database postgres --storage s3 --auth passkey,magic-link --pm pnpm --yes
```

It writes the database, media and secret straight into `tenon.config.ts`, the adapter and env schema into `astro.config.ts` (Astro), and the variables they read into `.env.example`, one block per database, storage and so on. `.env` (`.dev.vars` on Cloudflare) is a copy with a random `TENON_SECRET`. Fill in what it says, run `dev`, open `/admin` and create the first admin.

The config reads `site: { url: TENON_SITE_URL }`, the public origin to set in production; it is also the CMS origin for sign-in and admin links. Leave it commented out in development so the adapter detects the server's current URL. In Nuxt it is `NUXT_TENON_SITE_URL`, like every other variable. Core reads no env var itself.

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

## Users

```sh
npx tenon users create editor@example.com
npx tenon users recover admin@example.com
npx tenon users list
npx tenon users deactivate editor@example.com
npx tenon users remove editor@example.com
```

`users create` invites a user. It asks for the email and picks the role from a list of the configured roles: `admin` for the first user, else `editor` by default. It prints the invite link, and emails it as well when [email](./email.md) is set up. Without email it warns first: pass the link on yourself.

- `--role <role>` sets the role without asking. `--admin <path>` sets the admin's path for the link, if it is not `/admin`.
- `--password` creates the user at once instead, with a name and a password it asks for. It needs a terminal and works on the local project only.
- With `--url`, the invite goes through a deployed instance. It needs `tenon login` as an admin.

`users recover` prints a link that signs the user in once, within an hour. Use it when nobody can sign in, e.g. after a lost password with no email set up. Opening the link signs the user out everywhere else and opens the account settings. It asks first; without a terminal it needs `--yes`. It works on the local project only, because it needs the database, not a session.

`users list` prints every user with ID, name, email, role and status. In a terminal with colors, the status is green when active and red when deactivated. `users deactivate` ends the user's sessions and blocks sign-in, like **Deactivate** in the admin; `users reactivate` lifts that. `users remove` deletes the user, like **Remove** in the admin. It cannot be undone; their content stays. Deactivate and remove ask first, remove with No as the default; without a terminal they need `--yes`. The last active admin cannot be deactivated or removed. These four work on the local project only, like `users recover`.

`users create` and `users recover` build the link on the CMS origin: `auth.baseURL`, else `site.url`, else they ask, with `http://localhost:4321` as the default. Without a terminal, set `site.url` (for example from `TENON_SITE_URL`).

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
