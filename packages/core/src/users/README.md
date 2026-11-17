# users

Roles, invites and `cms.users`. User management itself is better-auth's `admin()` plugin, wired in `auth/config/`. Depends on [`db/`](../db/README.md) for the `cms_invites` queries and on [`auth/`](../auth/README.md) for the password rules.

## Follow an accept

`POST /invites/accept` flows through:

`endpoints/accept.endpoint.ts` → `operations/accept-invite.operation.ts` → `db/queries/invites/claim-invite.query.ts`

The endpoint requires JSON (`jsonOnly`) and validates the body with `input()`. `acceptInvite()` checks the password, claims the invite and calls `createAndSignIn()`, which creates the user through better-auth and signs them in with the server-only `signInUser`. The endpoint forwards the session cookies.

The password of an invite is required while password is the only sign-in method, optional next to a passkey or email method, and refused while password sign-in is off, each as a `ValidationError` on `password`. Without one, the user signs in with a passkey, an email method or `tenon users recover`, or sets a password later with `POST /account/password`.

## Files

| Path                                         | What it does                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `roles.ts`                                   | `BUILT_IN_ROLES`, `normalizeRoles()`: built-ins first, host roles checked.                         |
| `types.ts`                                   | `Invite`, `InviteResult`. Types only; the client imports them.                                     |
| `token.ts`                                   | `newToken()` (32 bytes, base64url) and `hashToken()` (SHA-256 hex, Web Crypto).                    |
| `invite-url.ts`                              | `inviteLink()`: the invite page with `?token=`, only on the allowed origin.                        |
| `invite.ts`                                  | `toInvite()` (row to API shape) and `INVITE_TTL` (7 days).                                         |
| `operations/send-invite.operation.ts`        | `sendInvite()`: renders and emails the invite; a failed send keeps the invite.                     |
| `operations/create-invite.operation.ts`      | Checks role and page, `assertFree()` for the email, inserts and sends.                             |
| `operations/resend-invite.operation.ts`      | New token and expiry, then sends again.                                                            |
| `operations/list-invites.operation.ts`       | Every invite, `expired` flagged.                                                                   |
| `operations/revoke-invite.operation.ts`      | Deletes an invite.                                                                                 |
| `operations/check-invite.operation.ts`       | `{ email, role, label }` of a valid token.                                                         |
| `operations/accept-invite.operation.ts`      | Checks the password, claims the invite, creates the user, signs in.                                |
| `operations/create-and-sign-in.operation.ts` | `createAndSignIn()`: creates a user without a request, signs them in, `undo` on a rejected create. |
| `operations/set-up.operation.ts`             | `setUpFirstAdmin()`: the first admin without a password, one call at a time.                       |
| `endpoints/setup.endpoint.ts`                | Public, JSON only: `POST /setup` with `{ name, email }`.                                           |
| `endpoints/invites.endpoint.ts`              | Protected, admins only: `GET`/`POST /invites`, `/:id/resend`, `DELETE /:id`.                       |
| `endpoints/accept.endpoint.ts`               | Public, JSON only: `POST /invites/check`, `POST /invites/accept`.                                  |
| `endpoints/input.ts`                         | `input()`: zod body validation that throws `ValidationError`.                                      |
| `api.ts`                                     | `usersApi()`: `cms.users`, for server code only.                                                   |
| `operations/create-user.operation.ts`        | Creates a user through better-auth without a request.                                              |
| `operations/sign-in-link.operation.ts`       | `createSignInLink()`: the one-time link of `tenon users recover`, emailed too.                     |
| `operations/list-users.operation.ts`         | `listUsers()`: every user, oldest first, as `UserSummary`.                                         |
| `operations/manage-user.operation.ts`        | `deactivateUser()`, `reactivateUser()`, `removeUser()`; a 409 becomes a `ConflictError`.           |

Invites live in `cms_invites` (migration `006_cms_invites`, queries in `db/queries/invites/`). One row per email; only the token's hash is stored. Expiry is compared with a `now` argument, so tests set it without fake time.

`POST /setup` creates the first admin while password sign-in is off; with it on, sign-up does that. It answers 404 while password is on and 409 once a user exists. `checkCreate()` reads "no user yet" before better-auth inserts, so two concurrent creates could both become admin. `setUpFirstAdmin()` chains its calls on one promise, so the second finds the first admin and answers 409. Separate server instances can still race; setup happens once. `sessionHint()` and `no-store` run on `/setup`, and `setup` is a reserved plugin name.

Acceptance claims first: `claimInvite()` deletes and returns the row in one statement, so a token creates one user even when two requests race. better-auth runs its own transactions, so the create cannot share one with the claim; a failed create puts the row back. better-auth's `createUser` skips the password length check that sign-up has, so `acceptInvite()` applies the host's `emailAndPassword.minPasswordLength` / `maxPasswordLength` (defaults 8 and 128) before claiming. The user is created with `emailVerified: true`: the link proved the address.

The public routes run before the CSRF check and require `application/json`. A cross-site request with that type needs a preflight, which fails, so another site cannot sign a visitor in to an account it chose. `/invites` answers `no-store`, and `sessionHint()` also runs on `/invites/accept`.

The invite page is in the admin, so it MUST be on the origin of a fixed better-auth `baseURL` (`auth.baseURL`, else `site.url`), or of the request without one. Core does not know the admin path, so the client sends the page as `url`. A failed send answers 502 with the result, so the admin can still copy `link`.

`cms.users` (`api.ts`) sits on the `defineCms()` instance, not on the local API hooks get. It checks no access rules, so it works only on an instance that skips them: a `withSession()` copy throws `ForbiddenError`. Its calls have no request, and in development without a base URL better-auth refuses such a call until it has a fallback origin. So every method that calls `auth.api` first runs `core.bindOrigin()`: `signInLink()` with its `origin`, the others with `http://localhost`, because they build no URL. It works without `auth.baseURL` or `site.url` in every mode; only a link needs an origin, which the caller passes. `invite()` reuses `createInvite()` without an inviter: the page MAY be on any origin, `invited_by` is `cli`, and the email says "You are invited". `create()` calls better-auth's `createUser` without headers, so `checkCreate()` trusts it and makes the first user an admin; the `passwordLength()` hook still applies. `signInLink()` asks the server-only `createSignInLink` endpoint of `auth/config/sign-in-user.ts` for a token and builds `<origin>/_tenon/auth/sign-in-link?token=`. A failed send keeps the link and adds `message`, like an invite. `roles()` returns `core.roles`, the list `/schema` sends the admin.

`list()`, `deactivate()`, `reactivate()` and `remove()` call the server-only endpoints of `manageUsers()` (`auth/config/manage-users.ts`) through `auth.api`: better-auth's `admin()` endpoints require an admin's session. The endpoints find the user by email and write what `banUser`, `unbanUser` and `removeUser` write: a ban without expiry and the end of every session; the ban lifted; the user, sessions and accounts deleted. Content keeps the removed user's id in `createdBy` and `updatedBy`, as after a removal in the admin. Over HTTP, `lastAdmin()` guards only `set-role`, because better-auth refuses self-ban and self-removal. A server call has no caller, so deactivate and remove check `otherAdmins()` for an active admin and throw a 409 `APIError`, which `manage-user.operation.ts` turns into a `ConflictError`. An unknown email stays better-auth's 404 `APIError`.
