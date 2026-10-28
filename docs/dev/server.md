# HTTP, auth and database

Code: `packages/core/src/http/`, `auth/`, `users/`, `client/`, `db/` (each has a README).

## Route order

The Hono app mounts feature routes in a fixed order. The order is the security model, so keep it.

1. CMS binding, then public plugin middleware
2. Session hint cookie on `/auth/*`, then auth routes and the **open** routes: admin branding, auth status, invites check and accept, `/localization`, public plugin routes, media files and images
3. **CSRF** (skipped with an API key), then `optionalSession` (one caller lookup per request)
4. Content **reads** (collections, globals, media folders)
5. Protected plugin middleware, then content **writes**. Access rules decide here.
6. `session` (401 without one), then `apiKeyReach()`, then all other protected routes

- Routes after `optionalSession` MUST use the request's scoped `cms`, user and perspective. They MUST NOT look up the session again.
- Every write route outside the content writes MUST sit behind `session`.
- Public plugin routes run before CSRF and session, so a plugin that writes there MUST protect itself.
- Hono's CSRF only checks form-like content types. JSON is safe because browsers preflight cross-origin JSON and we send no CORS headers. Public JSON endpoints that run before CSRF MUST reject other content types.
- Without a session, a path that matches no public route answers 401, not 404.
- Unexpected errors are logged and answered without their message.

## Query parsing

Filters, `populate` and `select` come in as query strings. The parsers build nested objects, so they MUST use objects without a prototype, or a `__proto__` segment pollutes every object in the process. Field names are checked against the schema before they reach SQL. Reads reject filters on fields the caller cannot read.

## Auth

- Auth is better-auth. The host's `auth` options pass through. Core owns the database, base path and secret.
- The first user becomes `admin`. After that, only an admin session can create users. Sign-up is open only during setup.
- A readable `integral-session` cookie mirrors the session cookie. It grants nothing; it only lets the site decide whether to ask for the admin bar.
- Passkeys are on unless the host adds its own. Users have `language` and `timezone` fields.
- `admin` and `editor` are built-in roles. Hosts add roles with `roles`. A missing role counts as `editor`.
- The last active admin cannot be demoted.

## API keys

- A key is better-auth's `apiKey()`. Its grid is better-auth's `permissions`: `{ "collection:posts": ["read"], schema: ["read"] }`. It never becomes a session, so better-auth's own endpoints ignore it.
- A key is its own caller. `caller()` checks `x-api-key` before the cookie and returns `{ user: null, apiKey: { id, name, permissions }, perspective: "published" }`. A key that is not valid (unknown, revoked, expired) throws 401.
- `apiKey` sits on `Scope`, `HookArgs` and `AccessArgs`. `decide()` checks the grid in the local API, so it holds for `withSession()` too. Writes that run no rule (upload parts, completion, abort) call `requireKeyGrant()`.
- `session` lets a key through to `apiKeyReach()`, which allows only `/schema` with `schema: ["read"]`. Every other route behind `session` answers 403 to a key, plugin `routes` included: their `RouteEnv` promises `c.var.user`.
- `createdBy` / `updatedBy` hold `actorId(scope)`: the user id, or `key:<id>`. better-auth ids hold no `:`. Uploads record the same actor.
- CSRF is skipped for a request with the header. A cross-site form cannot set it, and a cross-origin fetch with it needs a preflight, which fails.
- Only admins manage keys. better-auth's `/api-key/*` routes are closed over HTTP (`apiKeyRoutesOff()`). Core's `/api-keys` creates keys through better-auth without a request. Revoking sets `enabled = 0`; deleting removes the row. better-auth has no rotation, so rolling replaces `key` and `start` in place with `newApiKeySecret()`, which uses better-auth's exported `defaultKeyHasher` and the length `apiKeys()` sets.
- Verifying a key writes its `lastRequest`. better-auth's per-key rate limit is off.

## Invites

- Admins create, resend and revoke invites. Accepting is public.
- Tokens are random. Only their hash is stored. Invites expire after 7 days.
- Accepting claims the invite, creates the user, signs them in, and puts the invite back if user creation fails.
- The invite page MUST be on the site's origin.

## Client

The browser client mirrors the local API over HTTP and is typed from the schema. The admin uses the same client. It is browser-safe: no server imports. Types come from a registered config type; an unresolved alias silently becomes `any`, so keep the negative type tests.

## Database

- One documents table holds every collection. Another holds globals. Locale rows and drafts have their own tables. See [design decisions](design-decisions.md).
- **Published reads** see published rows and `data`. **Draft reads** see every row and use the draft where one exists.
- Relation ids sit in the JSON. Reverse lookups scan the JSON, with one nested step per list level. Id lists go in as one JSON parameter, so there is no variable limit.
- A localized query joins the locale table twice (requested and default). Qualify every column.
- **Migrations** are code in the bundle, run lazily on first use, before better-auth's. Add a new key; never edit one that shipped.
- The libsql driver is our own thin Kysely dialect.
