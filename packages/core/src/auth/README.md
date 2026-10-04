# auth

| Path                               | What it does                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `config/options.ts`                | Host better-auth options, reserving core-owned database, base path, secret and model names. |
| `config/build-options.ts`          | Builds provider options and checks first-user sign-up before host hooks.                    |
| `create-auth.ts`                   | Creates the better-auth provider.                                                           |
| `get-caller.ts`                    | Reads the request session and preview perspective; a cookie alone grants no draft access.   |
| `middleware/session.middleware.ts` | Requires a session and binds the CMS API to its user.                                       |
| `endpoints/provider.endpoint.ts`   | Delegates GET and POST auth requests to better-auth.                                        |

The provider endpoint runs before core CSRF/session middleware. Protected feature routes run after both checks. Request-scoped reads reuse `get-caller.ts`, including its existing public fallback when session lookup fails.
