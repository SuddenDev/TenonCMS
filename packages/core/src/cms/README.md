# CMS construction and runtime

It assembles the schema, prepares database and authentication access, and binds the local API used by server code, HTTP endpoints and hooks.
Start with [create-cms.ts](create-cms.ts): `defineCms()` connects these pieces. The actual document operations live in [collections](../collections/README.md) and [globals](../globals/README.md), with shared reads, writes and hooks in [content](../content/README.md).

Application code imports `defineCms`, `Cms` and `Api` from `integral-cms`. See the [project README](../../../../README.md) for application setup and the [core overview](../README.md) for the surrounding modules.

## What happens when `defineCms()` runs

Construction happens in this order:

1. **Resolve options.** Validate options and set defaults. `localization` gets `fallback: true` and `routing: { prefix: "except-default" }`.
2. **Assemble the schema.** Merge host and plugin collections/globals, add site settings (localized with `localization`), then add the built-in `media` collection when media is enabled. Duplicate plugin names and duplicate names within collections or globals throw instead of overwriting definitions.
3. **Validate the completed schema.** [check-schema.ts](../schema/validation/check-schema.ts) checks the assembled definitions and the `localization` config before any database connection opens.
4. **Create the shared core.** Prepare lazy database/auth functions (with the localized keys of every collection and global, which the database syncs after its migrations), store the schema, plugins, root hooks, population defaults and the normalized `localization`, and create the optional media core.
5. **Create the entry points.** Build the Hono app and return a typed local API with `schema`, `populate`, `localization`, `auth()`, `withDrafts()`, `withSession(request)` and `fetch(request)`.

## Default Collections and Globals

| Name      | Type       | Configuration option                    | Default                                 | Description                                                                                      |
| --------- | ---------- | --------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `general` | Global     | `settings.general`: `Global` or `false` | Enabled                                 | Site title, tagline, URL and favicon.                                                            |
| `seo`     | Global     | `settings.seo`: `Global` or `false`     | Enabled                                 | Title separator, social image, verification codes and indexing preference.                       |
| `media`   | Collection | `media`: `MediaOptions` or `boolean`    | Enabled on Node.js; disabled on Workers | Uploads and file metadata. Defaults to `./.uploads` storage and IPX image processing on Node.js. |

`settings: false` disables both settings globals. A `Global` replaces the corresponding [preset](../presets/settings.ts); duplicate global names throw. Without media, the presets omit `favicon` and `image`. With `localization`, the default globals are localized; a replacement is taken as is.

`media: false` disables the library; a `MediaOptions` object supplies custom providers and options. On Workers, `media: true` throws. See the [media README](../media/README.md).

### Database and auth are lazy

`defineCms()` validates and assembles configuration immediately, but does not open the database. The first `db()` call creates the connection, builds auth options, runs migrations and then `syncLocalized()`, which moves values between shared data and locale rows when the localized fields changed. Concurrent callers share the same initialization promise.

The first `auth()` call checks that `secret` has at least 32 characters, initializes the database if needed, and creates the shared better-auth instance. `getSession(headers)` uses that instance to resolve a request's session. Database queries and migrations belong to [db](../db/README.md); auth configuration and caller lookup belong to [auth](../auth/README.md).

## Shared core, caller scope and hook API

These three internal types explain how calls keep the right user, draft perspective and transaction:

| Type    | Lifetime and contents                                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Core`  | Shared by every instance created from one `defineCms()` call. Holds the assembled schema, plugins, hooks, defaults, `localization`, lazy runtime, optional media core, the `adminBar` option and `localApi(scope)` factory. |
| `Scope` | Carries a caller's `user`, read `perspective`, `locale` and `fallback`, optional transaction, hook `context` and `nested` flag.                                                                                             |
| `Inner` | A scope used inside an operation, with a `cms` API bound to that scope. Hooks receive this API.                                                                                                                             |

An ordinary server call starts with `user: null`, the published perspective and no locale; a `locale` option or the default locale applies per call (`withLocale()` in [content](../content/README.md)). Each outer operation gets a fresh `context` object. A call through a hook's `cms` inherits the current user, perspective, locale, context and transaction, and runs its own hooks.

`Core.localApi(scope)` lets the content engine create these nested APIs without importing all feature operations. [local-api.ts](api/local-api.ts) is the untyped contract that hooks, HTTP routes, plugins and preview functions get as `cms`, and that each `*.local.ts` implements one method of. [create-local-api.ts](api/create-local-api.ts) owns the method assembly; each feature owns its method implementation.

Inside hooks, use the supplied `cms` for nested calls. This keeps those calls in the current transaction. Calling the host's original CMS instance starts an independent operation and can block or fail when the database already has an active transaction.

### Transactions

Collection and global writes enter [content/lifecycle/run-operation.ts](../content/lifecycle/run-operation.ts), which opens a transaction when the scope has none. Nested calls reuse it. Reads open no transaction of their own, but use an inherited transaction when present. Globals skip collection `beforeOperation` and `afterOperation` hooks.

Media operations use `transaction()` from [runtime/transaction.ts](runtime/transaction.ts) when they need transactional database work. The helper also binds the nested hook API. `q(core, scope)` returns the scope's transaction when available, otherwise the shared database connection.

Unexpected errors from the collection/global lifecycle trigger `afterError` only for the outermost operation, after rollback. Validation and conflict errors skip that stage. The detailed hook and write order belongs to the [content README](../content/README.md).

## Published reads, drafts and sessions

The perspective chooses which version reads return:

- `published` returns published documents and their published data.
- `drafts` includes documents that have never been published and uses pending draft data when it exists.

`cms.withDrafts()` returns another instance sharing the same core, with the drafts perspective. It does not change the original instance or make writes save drafts. Draft saves use `{ draft: true }` on `create`, `update` or `setGlobal`; publish/discard methods manage those drafts.

For an already configured collection named `posts`:

```ts
const post = await cms.create("posts", { title: "Work in progress" }, { draft: true });
const published = await cms.findById("posts", post.id);
const draft = await cms.withDrafts().findById("posts", post.id);
```

Here `published` is `undefined` until the document is published, while `draft` contains the pending document. The collection must support drafts.

`await cms.withSession(request)` returns a caller-specific instance. [auth/get-caller.ts](../auth/get-caller.ts) resolves the session user and selects drafts only when a valid session accompanies the `integral-preview=drafts` cookie. Missing or failed session lookup falls back to `user: null` and published reads. Requests without cookies skip session lookup.

Local APIs are trusted server entry points. `withSession()` supplies caller information to hooks and selects the read perspective; HTTP session checks and public field filtering live in [http](../http/README.md).
