# auth

| Path                                    | What it does                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `config/options.ts`                     | Host better-auth options, reserving core-owned database, base path, secret and model names. |
| `config/build-options.ts`               | Builds provider options, adds `passkey()` and checks sign-up before host hooks.             |
| `config/user-fields.ts`                 | `userFields`: the validated `language` and `timezone` preferences on the user.              |
| `sign-up.ts`                            | `signUpStatus()`: `setup` while no user exists, `signUp` when a visitor MAY sign up.        |
| `create-auth.ts`                        | Creates the better-auth provider.                                                           |
| `get-caller.ts`                         | Reads the request session and preview perspective; a cookie alone grants no draft access.   |
| `middleware/session.middleware.ts`      | Requires a session and binds the CMS API to its user.                                       |
| `middleware/session-hint.middleware.ts` | `sessionHint()`: mirrors the session cookie in the readable `integral-session` hint cookie. |
| `endpoints/provider.endpoint.ts`        | Delegates GET and POST auth requests to better-auth.                                        |
| `endpoints/status.endpoint.ts`          | Public `GET /auth-status`: `signUpStatus()`, `no-store`.                                    |
| `endpoints/password.endpoint.ts`        | Protected `POST /account/password`: better-auth's server-only `setPassword()`.              |

The provider endpoint runs before core CSRF/session middleware. Protected feature routes run after both checks. Request-scoped reads reuse `get-caller.ts`, including its existing public fallback when session lookup fails.

When `email` is configured, `authOptions()` supplies password-reset and verification callbacks through the instance's [email module](../email/README.md). Host callbacks take precedence. Verification requirements and automatic sends stay under the host's Better Auth options.

`signUpStatus()` is the one place that decides whether sign-up is open; the first-user hook and `/auth-status` both read it. Today `signUp` equals `setup`.

`authOptions()` appends better-auth's `passkey()` unless a host plugin has the id `passkey`. `defineCms()` passes the host name of `site` as `rpID` and the admin `name` as `rpName`. The returned options keep the host's plugin type: passkey's endpoint types make the declaration build fail (TS7056), so `auth.api` does not type them.

The admin's `/forgot-password` and `/reset-password` screens use Better Auth's request, callback and reset endpoints. The client passes the admin's own reset URL as `redirectTo`, so custom admin paths work. Better Auth validates callback origins, password rules, expiry and single-use tokens. The UI clears the token from the address after success and returns to sign-in.

`sessionHint()` runs on `/auth/*`, before the provider endpoint. It reads the session cookie name from better-auth's
options (`getCookies()`) and compares names without the secure prefix. A set session cookie sets `integral-session=1`
(not `HttpOnly`, `Lax`, path `/`, `Secure` when the session cookie is); a cleared or expired one clears it. The hint
grants nothing. The site's preview runtime reads it only to decide whether asking for the admin bar is worth a request.
