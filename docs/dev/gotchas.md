# Gotchas

Each of these cost a debugging round. Check here when something behaves strangely.

## Build, dev servers and adapters

**Bundling and native code**

- Nitro rewrites `typeof window` to `"undefined"` as plain text, even inside strings. Keep browser-only code out of server bundles.
- libsql loads its native binary (`@libsql/<platform>`) with a dynamic require.
  - If Vite bundles core, the binding breaks. That is why the Astro adapter and `integralAdmin()` set core external in builds. Dev does not bundle, so core stays internal there.
  - Nitro 2 (Nuxt) does not trace the binary, so the Nuxt module adds it by hand. Nitro 3 (TanStack Start) traces it on its own.
- `tsdown` `copy` with a directory `from` nests that directory under `to`. Use the parent as `to`.
- Build on the OS and CPU you deploy to. libsql ships one binary per platform.
- esbuild (wrangler) reads the nearest `tsconfig.json` of each file. In this repo that applies core's `paths` to `packages/core/dist`, so `integral-cms/media/default` resolves to `src/` and pulls in IPX and sharp. Pass `--tsconfig tsconfig.json` to wrangler. Published installs ship no tsconfig and are not affected. Vite builds (the Astro adapter on Cloudflare) do not read `paths`.
- `wrangler deploy` cannot create an R2 bucket on an account without R2. It skips the bucket, treats the binding as inherited, and the first deploy fails with `inherit binding 'MEDIA' is invalid: previous version does not have binding named 'MEDIA'`. Enable R2 in the Cloudflare dashboard first (`wrangler r2 bucket list` answers code 10042 until then).

**Watchers and build output**

- `tsdown --watch` MUST run with `--no-clean`, or Nitro rebuilds while `dist/` is empty and logs ENOENT.
- Never run `build:packages` while a watcher runs. The core build deletes `dist/`, including `dist/admin`.

**Dev servers**

- Dev servers bind `[::1]`, and `curl localhost` hits them first. Test a production build on `HOST=127.0.0.1`, another port and its own `DATABASE_URL`. Otherwise you test a leftover dev server and write into its database.
- A leftover Astro daemon or `cms.db` makes sign-up return 403, because only the first user may sign up. Astro 7 `dev` and `preview` run as daemons: stop them with `npx astro dev stop` and `npx astro preview logs`.
- `astro preview` does not load `.env`. The script runs it through `node --env-file-if-exists=.env`.
- `nuxt preview` runs with its working directory in `.output/`, so a relative `file:./cms.db` lands in the build output and gets wiped. Use absolute paths.
- A leftover service worker on `localhost:3000` from another project can hijack navigation. If a page works in incognito but not normally, check DevTools, Application, Service workers.
- `configureServer` also runs during `vite build` (TanStack and Nitro). Check `this.environment.config.command === 'serve'`.
- TanStack Start fails with `multiple entries detected` on a second client entry. `integralAdmin()` clears the admin chunk's entry flag before Start reads it.
- TanStack Start streams HTML. Use `grep -a` on curl output, or grep treats it as binary and prints nothing.

**Typechecking**

- `astro check` does not find `@astrojs/check` under Astro 7. Use `astro sync && tsc --noEmit`.
- `tsc --noEmit` in the Astro example never checks `.astro` frontmatter. To test `App.Locals` typing, use a `.ts` file.
- Nuxt: use `nuxt typecheck`. Plain `vue-tsc --noEmit` with Nuxt's reference-only tsconfig checks nothing.
- Nuxt's generated route types import every server handler into the app project. Server runtime files in a module MUST import from `h3`, not `#imports`.
- The d.ts build needs explicit types on the Nuxt module (`NuxtModule<Options>`), and `@nuxt/schema` must be a peer or its types get inlined. Nitro hook types come from `import type {} from '@nuxt/nitro-server/augments'`.
- Kysely 0.29 exports `Migrator` from `kysely/migration`, not from `kysely`.

**Shell**

- zsh: quote paths like `[slug].vue`, or the glob silently matches nothing.
- `tsc` colors its output in some shells, so `grep "error TS"` can match nothing. Use `tsc --noEmit --pretty false`.

## Types

- A generic parameter with a default (`C = {}`) makes context-sensitive functions in the argument fall back to implicit `any`. `CmsOptions` intersects `collections` with a plain record inside `NoInfer` to give inline hooks a contextual type.
- Hooks in presets type `data` as `any`. With `Record<string, any>`, a spread with a computed key is not assignable to a typed collection's data. Their `collection` argument MUST stay optional, or hook types reject them.
- Generic inference skips excess property checks. Option objects like `populate` need `Exact` to reject unknown keys, and tests of field options use `satisfies Fields`.
- `keyof never` is every key, so `Exact<P, never>` would accept anything. `Exact` maps an object under a `true`-only key to `never`.
- Recursive read types hit TS2589 on an untyped schema (the admin's) without the wide-schema guard. The HTTP schema mapping crashes `vue-tsc` with a stack overflow without its own guard.
- Do not reshape the read result types without checking **both** `pnpm typecheck` and `tsdown`. One shape hits TS2589 in the tests, another builds fine but makes the declaration build run out of memory.
- The client's `findOne` calls `find` with explicit type arguments. Casting the result instead makes TypeScript compare two deferred read types (TS2589). The Nuxt composable passes options as `never` for the same kind of reason.
- A `defineCms({ ... } as never)` call infers the media type as `never`, and distributive conditionals then hit TS2589. Keep the media type check non-distributive and apply it to the return value.
- Typing the auth plugins with better-auth's `passkey()` breaks the declaration build (`defineCms` cannot be named without `@simplewebauthn/server`). Cast it, and destructure `plugins` out of the host options first, or the spread intersects both types into `never`.
- `defineCms()` infers literal locales through a `const` type parameter. The locale type is `never` without `localization` and `string` for an untyped instance. Check both builds after changing read options or locale metadata.
- A `relation` inside `blocks` makes the read types of that collection hit TS2589 in `find()`. Open bug, see `todo.md`.
- `@ts-expect-error` covers the next line only. When the formatter wraps a call, the directive MUST sit directly above the line with the invalid value.

## Server, data and HTTP

- PGlite has one connection, like `:memory:` libsql. The same rule applies.
- better-auth's migrations take no lock. Several instances on one fresh Postgres database (serverless cold starts) failed with `relation "session" already exists` until `migrate()` ran them inside its locked transaction. Keep them there.
- Vercel caps a request body at 4.5 MB. `s3()` is not affected: the browser uploads parts straight to the bucket. Storages that stream parts through the server (`local()`, `r2()`) would hit it, but `local()` fails there anyway, because the filesystem is read-only. Responses stream, so served files are not capped.
- On Postgres, raw SQL MUST quote better-auth's camelCase columns (`"updatedAt"`) and compare its booleans with `true` / `false`. `WHERE 1` and `IS ?` fail; use `TRUE` and `IS NOT DISTINCT FROM`.
- `:memory:` libsql has one connection. Code inside a transaction MUST use the transaction handle, and hooks MUST call the `cms` they get, or the call blocks or fails with `TRANSACTION_ACTIVE`.
- Query parsers MUST build nested objects without a prototype. On a plain `{}`, a `__proto__` segment returns `Object.prototype` and the next write pollutes every object in the process.
- `JSON.stringify` turns functions in arrays into `null`. The schema endpoint strips `hooks` and `access`, but only from objects that look like a field, collection, global or block, so a field named `hooks` stays.
- A dangling relation id reads as `null` (single) or drops out of the list (`many`) with the default populate. Tests that check stored ids MUST read with `populate: false`.
- An empty nested object is sent as the path itself over HTTP. `select: { parent: {} }` is `{ id }` locally but the whole value over HTTP. The same goes for `populate`.
- Browsers compile the HTML `pattern` attribute with the `v` flag, so the server does too. `<textarea>` ignores `pattern`.
- Hono's `csrf()` only checks form-like content types. JSON is protected because browsers preflight it cross-origin and we send no CORS headers.
- Without a session, a path that matches no public route answers 401, not 404. Test "route missing" cases with a session.
- consola writes to `process.stderr`, not `console.error`. Tests that assert a log spy on `process.stderr.write`.
- IPX prefixes ids with `/` and treats an undefined `getMeta()` as not found. The IPX storage strips the slash and returns `{}`.

## Access rules

- An access rule MUST run before the missing-document check. Otherwise a denied caller can tell missing ids from forbidden ones (404 versus 401).
- A group or a list item replaces its stored value as a whole. Fields inside it that the caller cannot read are put back before saving, or every save by a role without `read` would wipe them. The admin leaves such fields out of the payload for the same reason.

## Localization

- A localized query joins the locale table twice, next to the documents table, and the tables share column names. Qualify every condition and `ORDER BY`, or SQLite reports an ambiguous column. The query builder type is the same either way, so the compiler does not warn.
- The published perspective joins published locale rows only. `locales` lists published rows there and every row in the drafts perspective. In the published perspective, loading the locale document needs the shared row to be published, not the locale row.
- A `locale` option throws for any locale when `localization` is missing, even on an unlocalized collection. With `localization`, an unlocalized collection ignores a valid one.
- Discarding in one locale keeps the shared draft, because another locale may have edited it. Only `{ all: true }` drops it. A draft save that leaves shared values unchanged MUST NOT create a shared draft, or it shows as a pending change in every locale.
- Hooks get the default locale for unlocalized documents too. Code that stores or compares a locale MUST check that the document has `locales` first, or it hides unlocalized data from lookups without a locale.
- `cms.update()` in a locale without a row creates one. A hook that re-saves other documents (like child paths) MUST skip those without a row in the locale, or each untranslated child gets an empty translation.
- A locale stored as `null` falls back like a missing one. Filters on a localized field use the same fallback rule as reads, so filter and value agree. `unique` uses it too.
- Removing a localized field from the schema moves its stored values from the default locale's row into the shared row, and a pending locale draft becomes a shared draft. Temporary demo fields leave data behind this way.
- Astro's static routes match unprefixed URLs only. With `routing`, every route outside the catch-all needs a prefixed variant.
- `useAlternates()` clears the shared alternates on dispose only when they still hold its own value, because the next page sets its alternates before the old page is disposed.

## Admin UI and admin bar

**Vue and components**

- `Object.assign(el, { dataset: ... })` throws, because `dataset` is a getter. Use `setAttribute`.
- `:name` on a `<slot>` sets the slot's name, not a prop. Pass a prop called `name` as `v-bind="{ name, field }"`.
- vue-i18n compiles messages. `{`, `}`, `@`, `$` and `|` are syntax. Write a literal one as `{'@'}`, and use `|` only between plural forms.
- Generated shadcn-vue components import icons from the icon library statically, which pulls every icon into the bundle. Replace them with the `Icon` component. The CLI also prepends a Google Fonts `@import` to the stylesheet (remove it), and some registry items import `cn` from a package named `cn` (import it from the admin's utils and drop the dependency).
- The `Icon` component forces its own size, so a size class on it does nothing. Set a font size on its parent.
- The shadcn `CommandItem` throws outside a `CommandGroup`, and its check mark needs the `group-data-[state=checked]` variant, because reka sets `data-state`.
- A named import from the icon library next to the `Icon` component's dynamic import pulls the whole library in statically. The admin bar imports its glyphs one by one from deep paths.

**Styles**

- The admin's Tailwind scans only the admin's own source. HTML that a host or plugin writes gets only the utilities the admin itself uses, plus `.input` and `.btn`. Use inline styles for the rest.
- Tailwind scans comments in shared CSS too. The word "shadow" in a comment generates a `.shadow` class. Keep class-like words out of comments in scanned CSS.
- The first stylesheet on a page fixes the cascade layer order. Astro inlines the CSS of dynamically imported plugin chunks into the admin page, so the admin MUST prepend its own styles. Otherwise a plugin's Tailwind declaring layers first puts the admin's base layer above its utilities.

**Admin bar and shadow DOM**

- Chrome ignores `@property` and `@font-face` in a shadow root's stylesheet. Tailwind v4 initializes its ring, shadow, translate, border-style and animation variables with `@property`, so in the bar they compute to nothing. A PostCSS plugin unwraps the fallback. Web fonts do not load either, so the bar uses system fonts.
- Inherited properties (font, color, line height) reach a shadow root through its host and beat `:host` rules. The bar resets them with `all: initial` on one wrapper that holds both the bar and the portal target.
- reka portals teleport to `body` by default, outside the shadow root and its styles. Set the portal target on the config provider.
- A background Chrome tab fires no scroll events, animation frames or animations, and gets no real focus or key events. Test hiding on scroll, menus and keyboard in a foreground tab.
