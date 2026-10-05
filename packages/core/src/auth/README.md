# auth

| Path                                    | What it does                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `config/options.ts`                     | Host better-auth options, reserving core-owned database, base path, secret and model names. |
| `config/build-options.ts`               | Builds provider options and checks first-user sign-up before host hooks.                    |
| `create-auth.ts`                        | Creates the better-auth provider.                                                           |
| `get-caller.ts`                         | Reads the request session and preview perspective; a cookie alone grants no draft access.   |
| `middleware/session.middleware.ts`      | Requires a session and binds the CMS API to its user.                                       |
| `middleware/session-hint.middleware.ts` | `sessionHint()`: mirrors the session cookie in the readable `integral-session` hint cookie. |
| `endpoints/provider.endpoint.ts`        | Delegates GET and POST auth requests to better-auth.                                        |

The provider endpoint runs before core CSRF/session middleware. Protected feature routes run after both checks. Request-scoped reads reuse `get-caller.ts`, including its existing public fallback when session lookup fails.

`sessionHint()` runs on `/auth/*`, before the provider endpoint. It reads the session cookie name from better-auth's
options (`getCookies()`) and compares names without the secure prefix. A set session cookie sets `integral-session=1`
(not `HttpOnly`, `Lax`, path `/`, `Secure` when the session cookie is); a cleared or expired one clears it. The hint
grants nothing. The site's preview runtime reads it only to decide whether asking for the admin bar is worth a request.
