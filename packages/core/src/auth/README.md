# auth

| Path                                    | What it does                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `config/options.ts`                     | Host better-auth options, reserving core-owned database, base path, secret and model names.                                    |
| `config/build-options.ts`               | Builds provider options, adds `passkey()` and checks sign-up before host hooks.                                                |
| `config/user-fields.ts`                 | `userFields`: the validated `language` and `timezone` preferences on the user.                                                 |
| `config/access.ts`                      | `userAccess()`: the `admin()` plugin's permissions per role; only `admin` manages users.                                       |
| `config/last-admin.ts`                  | `lastAdmin()`: a small plugin that refuses `set-role` when no other active admin is left.                                      |
| `config/password-length.ts`             | `passwordLength()`: sign-up's length rules on `/admin/create-user`; `lengthProblem()`.                                         |
| `sign-up.ts`                            | `signUpStatus()`: `setup` while no user exists, `signUp` when a visitor MAY sign up.                                           |
| `create-auth.ts`                        | Creates the better-auth provider.                                                                                              |
| `get-caller.ts`                         | `caller()`: the request's user and preview perspective; a cookie alone grants no drafts.                                       |
| `api-key-caller.ts`                     | `apiKeyCaller()`: verifies an API key and returns `{ id, name, permissions }`.                                                 |
| `config/api-keys.ts`                    | `apiKeys()`: better-auth's `apiKey()`; `apiKeyRoutesOff()` closes its HTTP routes; `newApiKeySecret()` for rolling.            |
| `middleware/api-key.middleware.ts`      | `csrfUnlessApiKey()`; `apiKeyReach()`: behind `session`, a key reaches only `/schema` and, with `backup`, the transfer routes. |
| `middleware/session.middleware.ts`      | `optionalSession()` binds the CMS API to the caller once; `session` requires a session.                                        |
| `middleware/session-hint.middleware.ts` | `sessionHint()`: mirrors the session cookie in the readable `tenon-session` hint cookie.                                       |
| `endpoints/provider.endpoint.ts`        | Delegates GET and POST auth requests to better-auth.                                                                           |
| `endpoints/status.endpoint.ts`          | Public `GET /auth-status`: `signUpStatus()`, `no-store`.                                                                       |
| `endpoints/password.endpoint.ts`        | Protected `POST /account/password`: better-auth's server-only `setPassword()`.                                                 |

The provider endpoint runs before core CSRF/session middleware. `caller()` is the only place that turns a request into a user: `optionalSession()`, `cms.withSession()` and the media file routes call it. With `x-api-key` it returns the key as `apiKey` and no user, reading `published`, and throws 401 for a key that is not valid. Without a key or cookie it looks up nothing, and a failed session lookup counts as no user, so public pages keep working with a bad `secret`. Content routes run behind `optionalSession()`; protected feature routes also run behind `session`, which lets a key through to `apiKeyReach()`.

When `email` is configured, `authOptions()` supplies password-reset and verification callbacks through the instance's [email module](../email/README.md). Host callbacks take precedence. Verification requirements and automatic sends stay under the host's Better Auth options.

`signUpStatus()` is the one place that decides whether sign-up is open; the create hook and `/auth-status` both read it. Today `signUp` equals `setup`.

`authOptions(db, secret, host, { email, appName, roles })` appends better-auth's `admin()` unless a host plugin has the id `admin`: `userAccess(roles)`, `adminRoles: ["admin"]`, `defaultRole: "editor"`. Admins get every user and session permission except impersonation. `lastAdmin()`, `passwordLength()` and `apiKeyRoutesOff()` are always appended; `apiKeys()` unless a host plugin has the id `api-key`. `deviceAuthorization()` and `bearer()` are appended unless the host has them, for `tenon login`: the client id MUST be `tenon-cli` (`DEVICE_CLIENT_ID`), and the verification page is the admin's `/admin/device`, which signs in first, claims the code (`GET /auth/device`) and approves or denies it. The token the CLI gets is a session token; `bearer()` turns `Authorization: Bearer` into the session cookie, so `caller()` sees a normal session. A full restore empties the session and device code tables (`transfer/operations/full-tables.ts`). Core's `user.create.before` (`checkCreate()`) runs before the host's: the first user gets `role: "admin"`; after that a request needs an admin's session; a call without a request is trusted, which is how invite acceptance creates its user. Only `set-role` needs the last-admin guard: the caller of ban or removal is an active admin, and better-auth refuses both on oneself.

Passkeys are the host's `passkey()` plugin; core does not bundle `@better-auth/passkey` (an optional peer). `defineCms()` passes the admin `name` as the default `appName`, which `passkey()` uses as `rpName`. `/auth-status` reports `passkeys` when a plugin has the id `passkey`, and the admin shows its passkey UI only then. Rate limits default to `storage: "database"`, because serverless instances do not share memory. The returned options keep the host's plugin type: plugin endpoint types can make the declaration build fail (TS7056), so `auth.api` does not type them.

The admin's `/forgot-password` and `/reset-password` screens use Better Auth's request, callback and reset endpoints. The client passes the admin's own reset URL as `redirectTo`, so custom admin paths work. Better Auth validates callback origins, password rules, expiry and single-use tokens. The UI clears the token from the address after success and returns to sign-in.

`sessionHint()` runs on `/auth/*`, before the provider endpoint. It reads the session cookie name from better-auth's
options (`getCookies()`) and compares names without the secure prefix. A set session cookie sets `tenon-session=1`
(not `HttpOnly`, `Lax`, path `/`, `Secure` when the session cookie is); a cleared or expired one clears it. The hint
grants nothing. The site's preview runtime reads it only to decide whether asking for the admin bar is worth a request.
