# Users, roles and invites: implementation plan

Spec: `docs/superpowers/specs/2026-10-24-users-roles-invites-design.md`. Paths are relative to `packages/core/src` unless they start with `packages/` or `examples/`.

Rules for every task:

- TDD: write the test, run it, see it fail for the right reason, then the least code that passes. One test: `npx vitest run <file> -t '<name>'` in `packages/core`.
- After each phase: `pnpm test` and `pnpm -r typecheck` (or `pnpm typecheck` when no watcher runs). Phase 2 also runs core's `tsdown`, because plugin types can break the declaration build (TS7056).
- The existing auth suite (`tests/auth.test.ts`) is the regression check. It changes only where the spec changes behavior (a signed-in non-admin can no longer create users).
- Every new host-facing option gets JSDoc on the property.
- No commits unless asked.

Phase 0 checks the better-auth behavior the spec relies on. Phases 1 and 2 ship roles. Phases 3 to 6 ship invites on the server. Phases 7 and 8 are the admin. Phase 9 is docs and the smoke test.

---

## Phase 0: check better-auth `admin()` behavior (done)

Results: 1–6 as the spec assumes. In a `hooks.before`, `ctx.context.session` is empty; the last-admin guard does not need it. 7: better-auth runs its own transactions, so accept claims the invite first (phase 5).

A throwaway test in `tests/` (deleted after), on `fresh()` with `admin()` added by hand. Answer each question, and note any answer that differs from the spec before phase 2:

1. A user with `role` `NULL` passes `hasPermission` as `defaultRole` (spec: existing users read as `editor`).
2. `auth.api.createUser()` without headers works and runs `databaseHooks.user.create.before`, with `ctx.request` and `ctx.headers` both unset.
3. `hooks.before` with a matcher on `ctx.path === "/admin/set-role"` sees `ctx.body` and the session, and an `APIError` there stops the call.
4. The admin role built without `impersonate` gets 403 on `/admin/impersonate-user`.
5. `getSession()` returns `user.role`.
6. `auth.api.signInEmail({ body, returnHeaders: true })` returns the `Set-Cookie` headers.
7. Whether `createUser` can run inside a Kysely transaction core opens. If not, accept deletes the invite after the create (spec fallback).

---

## Phase 1: roles config (done)

### 1.1 Option and normalization

- `cms/config/options.ts`: `roles?: Record<string, RoleOptions>` on `CmsOptions`, with `RoleOptions = { label?: Text; description?: Text }`. JSDoc on both.
- `users/roles.ts` (new): `BUILT_IN_ROLES` (`admin`, `editor`, with `{ en, de }` labels and descriptions) and `normalizeRoles(roles)`. It returns `Role[]` (`{ name, label, description? }`), built-ins first. It throws for a bad name (`[a-z0-9-]`) and for `admin` or `editor`.
- `cms/runtime/types.ts`: `Core.roles: Role[]`. `cms/create-cms.ts` sets it.

Tests: `users/roles.test.ts`: built-ins first, label defaults to the name, the bad-name and built-in-name errors.

### 1.2 `/schema`

- `schema/endpoints/read.endpoint.ts`: send `roles` and `email: boolean` (whether `email` is configured). `http/app.ts` passes them like `localization`.
- `packages/core/src/admin/index.d.ts`: add `roles` and `email` to the schema descriptor type.

Tests: `tests/roles.test.ts` (new; add `roles` and `invites` to CLAUDE.md's list of areas): `/schema` lists built-in and host roles; `email` is `false` without email and `true` with it.

---

## Phase 2: `admin()` plugin and guards (done)

As built: `authOptions(db, secret, host, { email, relyingParty, roles })`, the guard is a core plugin on `set-role` only (see the spec), and the query is `db/queries/users/other-admins.query.ts`.

### 2.1 Plugin wiring

- `auth/config/build-options.ts`: `authOptions()` takes `roles: Role[]` (thread it through `cms/runtime/create-runtime.ts` like `relyingParty`). It appends `admin()` unless a host plugin has the id `admin`.
- `auth/config/access.ts` (new): builds `{ ac, roles }` with `createAccessControl(defaultStatements)` from `better-auth/plugins/access`. `admin` gets every user and session permission except `impersonate` and `impersonate-admins`; every other role gets `newRole({ user: [], session: [] })`.
- Options: `adminRoles: ["admin"]`, `defaultRole: "editor"`.
- Cast `plugins` to `A["plugins"]` as now. Run `tsdown` straight after this task.

### 2.2 User creation

- `firstUserOnly()` becomes `checkCreate()`. It returns the role overrides:
  - No user yet: return `{ data: { ...user, role: "admin" } }`. This also covers server calls.
  - A request without a session: unchanged (403 once a user exists).
  - A request with a session: 403 `Only admins can create users` unless `ctx.context.session.user.role === "admin"`.
  - No request: pass.
- The host's `create.before` still runs after core's, on core's result.

### 2.3 Last-admin guard

- `auth/config/last-admin.ts` (new): a `hooks.before` entry for `/admin/set-role` (new role is not `admin`), `/admin/ban-user` and `/admin/remove-user`. If the target is an active admin and no other active admin exists, it throws `APIError("CONFLICT", { message: "At least one admin is required" })`.
- `db/queries/users/active-admins.query.ts` (new): counts users with `role = 'admin'` and `banned` not true, excluding one id.
- Merge with the host's `hooks.before`: core first, as for database hooks.

Tests in `tests/roles.test.ts`:

- The first sign-up gets `admin`. A second user created by the admin (`/auth/admin/create-user`) defaults to `editor`.
- An editor's session gets 403 from `/auth/admin/create-user` and from `/auth/sign-up/email`. Update the matching case in `tests/auth.test.ts`.
- With one admin: demote, ban and remove each give 409. With two admins, demoting one works.
- `/auth/admin/impersonate-user` as admin gives 403.
- A collection `beforeChange` hook sees `user.role` on an HTTP write.
- A host plugin with the id `admin` replaces core's (startup does not add a second one).

---

## Phase 3: invite storage (done)

As built: every query takes `now` where expiry matters, so tests need no fake time. `users/token.ts` uses `btoa`, not `Buffer`.

- `db/migrations/cms.ts`: new key `006_cms_invites`, columns as in the spec, unique indexes on `email` and `token_hash`.
- `db/types.ts`: `InviteRow` and the `cms_invites` table.
- `db/queries/invites/` (new): `insert-invite.query.ts`, `invite-by-token.query.ts` (by hash, unexpired), `invite-by-email.query.ts`, `list-invites.query.ts`, `renew-invite.query.ts` (new hash and expiry), `claim-invite.query.ts` (`DELETE … RETURNING` by hash, unexpired), `delete-invite.query.ts`.
- `users/token.ts` (new): `newToken()` (32 random bytes, base64url) and `hashToken()` (SHA-256 hex, Web Crypto, so it runs on Workers later).

Tests: `db/migrations/migrate.test.ts` gets the new table. `users/token.test.ts`: the hash is stable, tokens differ.

---

## Phase 4: invite email (done)

As built: `Core.emailTemplates` (defaults merged with the host's, missing without email) replaces `hasEmail`; `/schema` `email` is `!!core.emailTemplates`.

- `email/types.ts`: `InviteTemplateData`, `InviteTemplate`, `invite` on `EmailTemplates` (it stays `Partial` in `EmailOptions`).
- `email/templates.ts`: the default `invite` template (subject, text and escaped HTML, like `resetPassword`). `role.label` and `site` are English text.

Tests: `email/templates.test.ts`: content, HTML escaping of name and site, replacement through `templates.invite`.

---

## Phase 5: invite operations and endpoints (done)

As built: the 502 is a typed response (`result.message` set by `sendInvite()`), no new error class. `acceptInvite()` checks the password length against the host's `emailAndPassword` options before claiming, because better-auth's `createUser` does not. The public routes require `application/json` (415 otherwise), so a cross-site form cannot sign a visitor in. `/invites` and `/invites/*` answer `no-store`. `sessionHint` also runs on `/invites/accept`.

### 5.1 Operations

In `users/operations/`, one file each:

- `create-invite.operation.ts` `(core, inviter, { email, role, url })`:
  1. Lowercases the email and validates it with zod.
  2. Checks the role against `Core.roles` (400) and `url` with `checkInviteUrl()` (400).
  3. Answers 409 when a user or an unexpired invite has the email; replaces an expired invite.
  4. Inserts the invite and builds `link`.
  5. Sends the email when `core.email` is configured.
  6. Returns `{ invite, link, sent }`. On a send failure it throws a 502 error that carries `link`.
- `resend-invite.operation.ts`: 404 for an unknown id. Otherwise it renews the token and expiry, then sends as in create.
- `revoke-invite.operation.ts`, `list-invites.operation.ts` (adds `expired`).
- `check-invite.operation.ts` `(core, token)`: `{ email, role }` or 404.
- `accept-invite.operation.ts` `(core, { token, name, password })`: steps 1 to 4 of the spec. It claims first (`claim-invite.query.ts`, `DELETE … RETURNING`), creates the user, and re-inserts the claimed row when the create throws. It returns the `Set-Cookie` headers.
- `users/invite-url.ts` (new): `checkInviteUrl(url, site, requestOrigin)`.

The 502 needs a status the HTTP layer maps: either a small `DeliveryError` in `errors.ts` (no imports, so the admin can import it) or a typed response from the endpoint. Pick the one `http/errors.ts` handles with less code.

### 5.2 Endpoints

- `users/endpoints/invites.endpoint.ts`: protected `GET /invites`, `POST /invites`, `POST /invites/:id/resend`, `DELETE /invites/:id`. One `requireAdmin` middleware answers 403 unless `c.var.user.role === "admin"`. Bodies are validated with zod, as in `auth/endpoints/password.endpoint.ts`.
- `users/endpoints/accept.endpoint.ts`: public `POST /invites/check` and `POST /invites/accept`. Accept sets the returned cookies on the response; the session-hint middleware runs only on `/auth/*`, so set `integral-session=1` here with the helper from `session-hint.middleware.ts` (export it if needed).
- `http/app.ts`: public routes on `reads`, protected ones on `writes`, before `mountRoutes`.
- `cms/config/merge-plugins.ts`: add `invites` to the reserved names. Also update `plugins/README.md` and the CLAUDE.md list.

Tests: `tests/invites.test.ts` (new), every case in the spec's list. Use a recording `EmailAdapter` (see `tests/email.test.ts`) and a rejecting one. Expiry: insert an invite with a past `expires_at` through the query, rather than faking time.

---

## Phase 6: client (done)

- `client/types/`: `Invite`, `InviteResult` and the `invites` methods on `Client`.
- `client/create-client.ts` (or `client/invites.ts` if it grows): `list`, `create`, `resend`, `revoke`, `check`, `accept` over `create-request.ts`.
- `client/index.ts`: export the types.

Tests: drive phase 5's `tests/invites.test.ts` through `client.invites` where it reads better than raw `fetch`. A type test in `schema/inference/inference.test.ts` is not needed: no schema inference is involved.

---

## Phase 7: admin, Users screen (done)

As built: `/users` is not `meta.full`. The Users entry sits in the menu pane under Manage, and a full page has no menu pane. Non-admins are sent to `/` by `meta.admin` in `App.vue`, which also never mounts the view for them. `Session["user"]` has `role`.

- `packages/admin/src/modules/users/users.ts` (new): calls to better-auth's `/auth/admin/list-users`, `set-role`, `ban-user`, `unban-user`, `revoke-user-sessions`, `remove-user`, and `/auth/request-password-reset`, in the style of `modules/auth/account.ts`.
- `modules/users/status.ts` (new, unit-tested): `rows(users, invites, now)` merges both lists into table rows with a status (`active`, `deactivated`, `invited`, `expired`).
- `modules/users/views/Users.vue`: the table and the row menus from the spec, `AlertDialog` confirmations, `sonner` toasts for errors.
- `router.ts`: the `/users` route (`meta.full`, breadcrumb "Users") and a guard that sends non-admins to `/`.
- `shared/composables/useMenu.ts`: the "Users" entry in `Admin` (order 110, icon `users`) when the session user is an admin. The user comes through `sessionKey` or `useSession()`; check what `useMenu()` can reach.
- `shared/i18n/en.ts` and `de.ts`: a `users` section.

Tests: `modules/users/status.test.ts`; a component test that the Users entry and `/users` are hidden for an editor.

---

## Phase 8: admin, invite dialog and accept screen (done)

As built: `InviteDialog.vue` emits `created(result, failed)` and closes; `LinkDialog.vue` shows the link to copy, also after a resend. `/invites/check` also returns the role `label`, because the invite page has no `/schema`.

- `modules/users/components/InviteDialog.vue`: email and role select (`ChoiceInput.vue` or the shadcn select used elsewhere for a single dropdown), submit through `client.invites.create()` with `url` = the admin's `/invite` URL (built like the reset page's `redirectTo`). It shows the sent message, or the copy-link view (also on 502).
- The Users screen's "Invite user" opens it. An invite row's Resend shows the copy link the same way.
- `modules/auth/components/Invite.vue`: the accept screen in `AuthCard`, with `PasswordInput variant="register"`. It clears the token from the address on success, as `PasswordReset.vue` does, then reloads the session and opens `/`.
- `router.ts`: `/invite` with `meta.auth` (not `guest`). Check that `App.vue` lets a signed-in user see an `auth` route that is not `guest`.

Tests: `InviteDialog.test.ts` (sent, not sent, 502) and `Invite.test.ts` (valid, invalid or expired, success), with `render.ts` helpers like `PasswordReset.test.ts`.

---

## Phase 9: docs and smoke test (done)

As built: curl smoke on the Astro example (temp DB, port 4399) and one invite accepted in Chrome. `.env` had `SMTP_URL` without a catcher, so both runs took the 502 path; the link dialog and the accept screen worked. The smoke steps are in CLAUDE.md.

- README: roles and `roles` config, the Users screen, invites with and without email, `templates.invite`, and the updated sign-up rules (replace the line that a signed-in user can create users).
- `auth/README.md` (admin plugin, `checkCreate()`, last-admin guard), `email/README.md` (`invite` template), new `users/README.md`, `src/README.md` module list.
- CLAUDE.md: the `users/` module, the plugin wiring, `006_cms_invites`, the reserved `invites` name, `/schema` `roles` and `email`, the admin's `modules/users/` and `/invite`, the two new test areas.
- Smoke test on the Astro example, with a temp DB (see the "Smoke tests isolated" memory), no SMTP:

```sh
B=localhost:4321; J=/tmp/jar; K=/tmp/jar2
curl -s -c $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"name":"Admin","email":"a@b.co","password":"password123"}' $B/api/cms/auth/sign-up/email
LINK=$(curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"email\":\"e@b.co\",\"role\":\"editor\",\"url\":\"http://$B/admin/invite\"}" $B/api/cms/invites \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).link')
T=${LINK#*token=}
curl -s -c $K -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"token\":\"$T\",\"name\":\"Ed\",\"password\":\"password123\"}" $B/api/cms/invites/accept
curl -s -o /dev/null -w '%{http_code}\n' -b $K $B/api/cms/schema
curl -s -o /dev/null -w '%{http_code}\n' -b $K -H "origin: http://$B" $B/api/cms/invites
```

Expect the sign-up user, a link, the new user, then `200` and `403`. Then accept in the browser once: invite from the Users screen, open the link in a private window, set a password, land in the admin.

- Final: `pnpm test`, `pnpm typecheck`, `pnpm lint`.
