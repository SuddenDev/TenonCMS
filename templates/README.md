# templates

The starters of `create-tenoncms`. It downloads this folder with giget. `index.json` lists what the prompts offer; a target lists its databases and storages, the first being the default. A target also lists its `images`, the first being the default. Every target offers the same `emails`, the first being the default.

## Layers

It copies these folders into the project, in order. Later files overwrite earlier ones:

1. `<framework>/<template>/`: the content, pages and framework config.
2. `_targets/<target>/`: shared by every framework.
3. `<framework>/_targets/<target>/`: the framework's own files, if any.
4. `_databases/<database>/`, or `_targets/<target>/_databases/<database>/` when the target has its own version (Vercel: a libSQL URL MUST be set, and Postgres attaches its pool).
5. `_storages/<storage>/`, with the same override.
6. `_images/<provider>/` for the image provider, with the same override. `none` has no folder. `ipx` adds the `ipx` package.
7. `_emails/<adapter>/` for the email adapter, if any. `none` has no folder. `smtp` adds `nodemailer` and the `email` block.
8. `_auth/<method>/` for each sign-in method that has one. Only `passkey` does: its `package.json` adds `@better-auth/passkey`.

`package.json` files are merged: a layer adds or replaces `scripts` and dependencies. `tenoncms: "latest"` becomes the current version.

In `wrangler.jsonc` (Cloudflare), every `tenon-site` becomes the project's name as a Worker name (`toWorkerName()`): the Worker and the bucket `<name>-media`.

## part.json

A layer's `part.json` is not copied. It says what the layer adds:

- `files`: per file, `imports`, `setup` (statements after the imports), `options` lines and `media` lines. The `media` lines of the storage and image layers go into one `media: { … }` option. They replace the file's `// @tenon-imports` and `// @tenon-options` lines. `// @tenon-env` (in `astro.config.ts`) gets the env schema, `// @tenon-runtime-config` (in `nuxt.config.ts`) the keys of `runtimeConfig`. A file without blocks (`"nuxt.config.ts": {}`) only gets its markers filled.
- `env`: the variables the code reads as `$NAME`, with `example`, `default`, `optional`, `url` and a `comment`. In Astro (`envModule` in `index.json`) `$NAME` is imported from `astro:env/server`. In Nuxt (`runtimeConfig`) it reads `useRuntimeConfig()`: `$DATABASE_URL` becomes `config.databaseUrl`, its default goes into `nuxt.config.ts`, and the env files name it `NUXT_DATABASE_URL`. Elsewhere it reads `process.env`.
- `ignore`: lines for `.gitignore`.
- `builds`: dependencies whose install scripts MUST run, such as `esbuild` and `workerd`. With pnpm, they go into `allowBuilds` of `pnpm-workspace.yaml`, because pnpm refuses an install with unapproved builds. A local smoke run MAY miss a new one: the store can hold a copy built for the repository. CI starts with an empty store.

Every project gets `secret: $TENON_SECRET` (`SECRET_PART`) and `site: { url: $TENON_SITE_URL, name }` (`sitePart()`), with `TENON_SITE_URL` commented out in the env example. The sign-in methods have no `part.json`: several methods share one `auth` block, so `authPart()` in `packages/create-tenoncms/src/stack.ts` writes it. Password alone writes nothing. The variables go into `.env.example` (`envFile` of the target, `.dev.vars` on Cloudflare), and a copy with a random `TENON_SECRET` becomes the real file.

Astro and Nuxt read `admin.path` from `tenon.config.ts`, and standalone's `server.ts` reads `cms.adminPath`. The TanStack route file (`src/routes/admin.$.ts`) MUST match `admin.path`.

## Checks

A new template MUST work with each database and storage of its targets. Locally run `pnpm tarball`, then `pnpm smoke:templates <framework> <target> [database] [storage] [template] [auth]`, where `auth` is the `--auth` list. CI runs the jobs of `scripts/template-matrix.mjs`; each framework runs once with `passkey,magic-link` and no password.

Renovate (`.github/renovate.json`) groups the dependency updates of `templates/` into one weekly PR, so the starters stay current and CI shows what breaks.
