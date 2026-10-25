# Users, roles and invites

## Scope

Give each user one role, let admins manage users in the admin, and let admins invite new users by email or by a copied link. Access control (`access` rules on collections, globals and fields) is a separate spec that follows this one. It reads `user.role`; until then the only role-based rule is that `admin` manages users.

Out of scope: access rules, a typed `Role<C>` union, impersonation, editing another user's name or email, bulk actions, user search and paging.

## Roles

`defineCms({ roles })` adds host roles:

```ts
roles: {
  author: { label: { en: "Author", de: "Autor" }, description: "Writes posts" },
}
```

- `admin` and `editor` are built in. `admin` manages users. `editor` and every host role have no user permissions.
- Role names MUST match `[a-z0-9-]`. A host role named `admin` or `editor` throws at startup.
- `label` and `description` are `Text`. `label` defaults to the name.
- `Core.roles` holds the normalized list, built-ins first. `/schema` sends `roles: [{ name, label, description }]`.
- Every signed-in role can read and write all content, as every signed-in user can today.

## better-auth `admin()` plugin

`authOptions()` appends better-auth's `admin()` plugin, as it does `passkey()`. A host plugin with the id `admin` replaces core's.

- `roles` comes from `createAccessControl(defaultStatements)`. `admin` gets every user and session permission except `impersonate` and `impersonate-admins`. `editor` and every host role get no permissions.
- `adminRoles: ["admin"]`, `defaultRole: "editor"`.
- The plugin adds `role`, `banned`, `banReason` and `banExpires` to the user and `impersonatedBy` to the session. better-auth's migrations create the columns. There is no upgrade path for existing databases: existing users without a role read as `editor`.
- The session user carries `role`, so `Scope.user.role` reaches hooks, plugin routes and loaders.
- If typing the plugin breaks the declaration build (TS7056/TS2883, as with passkey), it is cast to the host's `A["plugins"]` the same way.

### User creation

Core's `user.create.before` hook runs first, as now:

- No user exists: the new user gets `role: "admin"`.
- A request without a session MUST NOT create a user once a user exists (unchanged).
- A request with a session MAY create a user only if the session user's role is `admin`. Today any session passes; this closes that gap.
- Server calls without a request are trusted (unchanged). Invite acceptance uses this.

### Last-admin guard

A small core plugin (`integral-last-admin`) adds a `hooks.before` on `/admin/set-role`. It refuses a change away from `admin` when no other active admin (role `admin`, not banned) exists, with 409 `At least one admin is required`. Ban and removal need no guard: the caller is an active admin, and better-auth refuses self-ban and self-removal, so one always remains.

## Invites

### Table

Migration `006_cms_invites` adds `cms_invites`:

| Column       | Type    | Note                                          |
| ------------ | ------- | --------------------------------------------- |
| `id`         | text PK | random UUID                                   |
| `email`      | text    | unique, stored lowercase                      |
| `role`       | text    | a role name from `Core.roles`                 |
| `token_hash` | text    | unique, SHA-256 hex of a 32-byte random token |
| `invited_by` | text    | user id                                       |
| `expires_at` | integer | 7 days after creation or resend               |
| `created_at` | integer |                                               |

The raw token is never stored. An expired invite stays in the table until it is revoked, resent or replaced.

Queries live in `db/queries/invites/`. Operations live in a new `users/` module (`users/operations/`, `users/endpoints/`, `users/README.md`).

### Protected endpoints

Behind CSRF and the session middleware. Each requires the session user's role to be `admin`, else 403. `invites` joins the reserved plugin names.

| Route                      | Body                   | Does                                                                                       |
| -------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| `GET /invites`             |                        | Pending invites `{ id, email, role, invitedBy, expiresAt, createdAt, expired }`, no tokens |
| `POST /invites`            | `{ email, role, url }` | Creates an invite and sends it                                                             |
| `POST /invites/:id/resend` | `{ url }`              | New token and expiry; sends again. The old token stops working                             |
| `DELETE /invites/:id`      |                        | Revokes the invite                                                                         |

- `POST /invites` answers 409 when a user or a pending (unexpired) invite has the email. An expired invite for the email is replaced. An unknown role is 400.
- `url` is the admin's `/invite` page, passed by the client like password reset's `redirectTo`, because core does not know the admin path. Its origin MUST equal the origin of `site`, or of the request when `site` is unset; otherwise 400.
- Create and resend answer `{ invite, link, sent }`. `link` is `url` with `?token=<token>`. `sent` is `false` when no email is configured.
- When the adapter rejects, the response is 502 with the `link`, and the invite is kept.
- An unknown or foreign `:id` is 404.

### Public endpoints

Mounted with the public routes, before the session middleware.

- `POST /invites/check` `{ token }`: `{ email, role, label }` (the role's `Text` label, for the invite page, which cannot read `/schema`) for a valid, unexpired token, else 404. The token travels in the body so it stays out of access logs.
- `POST /invites/accept` `{ token, name, password }`:
  1. Claims the invite: one `DELETE … RETURNING` by token hash and unexpired, else 404. Two requests with one token cannot both claim it.
  2. Creates the user with `auth.api.createUser({ body: { email, name, password, role, data: { emailVerified: true } } })`, a trusted server call. better-auth runs its own transactions, so this cannot share one with step 1.
  3. If the create fails, puts the claimed invite back unchanged and rethrows.
  4. Signs the user in with `auth.api.signInEmail({ returnHeaders: true })` and forwards its `Set-Cookie` headers. The session hint cookie is set too.

  better-auth's password rules apply: a short password is 400 and the invite stays. A token can be used once.

Token lookups compare hashes, so timing does not leak the token.

### Email

`EmailTemplates` gets `invite`. It has its own data type, because no user exists yet:

```ts
type InviteTemplateData = {
  email: string;
  role: { name: string; label: string };
  url: string;
  inviter: { name: string; email: string };
  site: string;
};
```

`role.label` and `site` (the admin `name`, default `integral-cms`) are English text. The default template in `email/templates.ts` renders subject, text and escaped HTML. `email.templates.invite` replaces it.

## Client

`client.invites`: `list()`, `create({ email, role, url })`, `resend(id, { url })`, `revoke(id)`, `check(token)`, `accept({ token, name, password })`. The return types match the endpoints.

The admin calls user actions on better-auth's `/auth/admin/*` endpoints directly, as `modules/auth/account.ts` calls better-auth now, without better-auth's client package. These are `list-users`, `set-role`, `ban-user` (no expiry), `unban-user`, `revoke-user-sessions`, `remove-user` and `list-user-sessions`. Password reset uses the existing `/auth/request-password-reset` with the user's email.

## Admin UI

### Navigation

A "Users" entry in the `Admin` group of the sidebar (order 110, icon `users`), route `/users`, in the default page pane, so the menu stays beside it. It shows only when the session user's role is `admin`. The router guard sends other users from `/users` to `/`.

### Users screen

`modules/users/views/Users.vue`: one table, with an "Invite user" button in the header.

- Columns: name and email, role (label), status, joined (`createdAt`).
- Status: Active, Deactivated (banned), Invited, Invite expired.
- Users and pending invites share the table; invites come after users.
- Loads up to 100 users through `list-users`.
- User row "…" menu: Change role (a radio submenu), Send password reset (only with email configured), Sign out everywhere, Deactivate or Reactivate, Remove. Your own row hides Deactivate and Remove.
- Invite row "…" menu: Resend, Revoke. After a resend, the row offers Copy link.
- Remove, Deactivate and Revoke confirm in an `AlertDialog`.
- A 400 or 409 shows the server's message as an error toast.

`/schema` tells the admin whether email is configured (`email: boolean`), so it can hide password reset and word the invite outcome.

### Invite dialog

`modules/users/components/InviteDialog.vue`: email and a role select from `/schema` `roles` (label and description), default `editor`. The client sends `url` as the admin's own `/invite` URL.

- `sent: true`: "Invitation sent to <email>." The dialog closes.
- `sent: false` or 502: the dialog shows the link read-only with a copy button and "Send this link yourself. It expires in 7 days." On 502 it adds that sending failed.

### Accept screen

`/invite?token=`, a `meta.auth` route rendered in `AuthCard`, not `meta.guest`, so a signed-in user who opens a link still sees it.

1. Calls `client.invites.check(token)`. A valid token shows "You were invited as <role>.", the email read-only, a name input and `PasswordInput variant="register"`.
2. Submit calls `client.invites.accept()`. On success the token leaves the address and the admin opens `/`, signed in.
3. An invalid or expired token shows "This invitation is no longer valid. Ask an admin for a new one." and a link to sign in.

Every string is in `shared/i18n/en.ts` and `de.ts`. Role labels go through `text()`.

## Testing

TDD: each behavior starts with a failing test.

`src/tests/roles.test.ts`:

- The first sign-up gets `admin`; a later user defaults to `editor`.
- Startup throws for a host role named `admin` or `editor`, or with an invalid name.
- `/schema` lists the roles.
- An editor's session gets 403 from `/auth/admin/create-user` and `/auth/sign-up/email`.
- The last-admin guard refuses demoting, deactivating and removing the only admin.
- An admin cannot impersonate.
- `user.role` reaches a hook.

`src/tests/invites.test.ts`:

- An editor gets 403 on every protected invite route.
- Create, check and accept: the user has the role and `emailVerified`, the session cookie is set, the invite is gone.
- An expired, revoked or used token is 404 on check and accept.
- 409 for an email of a user or a pending invite; an expired invite is replaced. 400 for an unknown role and a foreign-origin `url`.
- Resend makes the old token fail.
- A short password is 400 and keeps the invite.
- A recording adapter gets one invite message with the link; without `email`, `sent` is `false`; a rejecting adapter gives 502 and keeps the invite.
- A raw table read finds only the token hash.

Unit tests: role normalization and the default invite template (`templates.test.ts`).

Admin tests (Vitest + Vue Test Utils, like `Login.test.ts`): `InviteDialog` outcomes, the accept screen's valid, invalid and success paths, and the hidden menu entry and `/users` guard for editors.

Manual check on the Astro example (`B=localhost:4321`, no SMTP): sign up, create an invite and take `link` from the response, accept it with a fresh cookie jar, then check that the new user reads `/schema` and gets 403 on `GET /invites`.

Done when `pnpm test`, `pnpm typecheck` (which includes the tsdown declaration build) and `pnpm lint` pass.

## Documentation

- README: roles, the Users screen, invites with and without email, the `invite` template, and the updated sign-up rules.
- CLAUDE.md: the `users/` module, the `admin()` plugin wiring, migration `006_cms_invites`, the reserved `invites` name and the admin's `modules/users/`.
- `auth/README.md`, `email/README.md` and the new `users/README.md`.
