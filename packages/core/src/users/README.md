# users

Roles and invites. User management itself is better-auth's `admin()` plugin, wired in `auth/config/`. Depends on [`db/`](../db/README.md) for the `cms_invites` queries and on [`auth/`](../auth/README.md) for the password rules.

## Follow an accept

`POST /invites/accept` flows through:

`endpoints/accept.endpoint.ts` → `operations/accept-invite.operation.ts` → `db/queries/invites/claim-invite.query.ts`

The endpoint requires JSON and validates the body with `input()`. `acceptInvite()` checks the password length, claims the invite, creates the user through better-auth and signs them in. The endpoint forwards the session cookies.

## Files

| Path                                    | What it does                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `roles.ts`                              | `BUILT_IN_ROLES`, `normalizeRoles()`: built-ins first, host roles checked.      |
| `types.ts`                              | `Invite`, `InviteResult`. Types only; the client imports them.                  |
| `token.ts`                              | `newToken()` (32 bytes, base64url) and `hashToken()` (SHA-256 hex, Web Crypto). |
| `invite-url.ts`                         | `inviteLink()`: the invite page with `?token=`, only on the allowed origin.     |
| `invite.ts`                             | `toInvite()` (row to API shape) and `INVITE_TTL` (7 days).                      |
| `operations/send-invite.operation.ts`   | `sendInvite()`: renders and emails the invite; a failed send keeps the invite.  |
| `operations/create-invite.operation.ts` | Checks role and page, `assertFree()` for the email, inserts and sends.          |
| `operations/resend-invite.operation.ts` | New token and expiry, then sends again.                                         |
| `operations/list-invites.operation.ts`  | Every invite, `expired` flagged.                                                |
| `operations/revoke-invite.operation.ts` | Deletes an invite.                                                              |
| `operations/check-invite.operation.ts`  | `{ email, role, label }` of a valid token.                                      |
| `operations/accept-invite.operation.ts` | Checks the password, claims the invite, creates the user, signs in.             |
| `endpoints/invites.endpoint.ts`         | Protected, admins only: `GET`/`POST /invites`, `/:id/resend`, `DELETE /:id`.    |
| `endpoints/accept.endpoint.ts`          | Public, JSON only: `POST /invites/check`, `POST /invites/accept`.               |
| `endpoints/input.ts`                    | `input()`: zod body validation that throws `ValidationError`.                   |

Invites live in `cms_invites` (migration `006_cms_invites`, queries in `db/queries/invites/`). One row per email; only the token's hash is stored. Expiry is compared with a `now` argument, so tests set it without fake time.

Acceptance claims first: `claimInvite()` deletes and returns the row in one statement, so a token creates one user even when two requests race. better-auth runs its own transactions, so the create cannot share one with the claim; a failed create puts the row back. better-auth's `createUser` skips the password length check that sign-up has, so `acceptInvite()` applies the host's `emailAndPassword.minPasswordLength` / `maxPasswordLength` (defaults 8 and 128) before claiming. The user is created with `emailVerified: true`: the link proved the address.

The public routes run before the CSRF check and require `application/json`. A cross-site request with that type needs a preflight, which fails, so another site cannot sign a visitor in to an account it chose. `/invites` answers `no-store`, and `sessionHint()` also runs on `/invites/accept`.

The invite page MUST be on the origin of `site`, or of the request without `site`. Core does not know the admin path, so the client sends the page as `url`. A failed send answers 502 with the result, so the admin can still copy `link`.
