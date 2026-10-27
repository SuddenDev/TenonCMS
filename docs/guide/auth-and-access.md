# Auth, users and access

Three things live here: how people sign in, how users and roles work, and how you control who can do what with content.

## Signing in

The admin signs in at `/login`.

- While no user exists, every admin URL leads to `/signup`, which creates the first admin. After that, sign-up is closed: `/signup` redirects to `/login`, and the sign-in shows no sign-up link. New users join through [invites](#users-and-roles).
- `GET /api/cms/auth-status` answers `{ setup, signUp }` for custom forms.
- The admin supports email and password, passkeys, and password reset. Plugins that need other screens (2FA, magic link) work on the server but not in the admin yet.

### Account settings

**Account settings** in the user menu lets a user:

- edit their name, admin language and time zone. Dates in forms and the publication status follow the time zone. Empty follows the device.
- change the password (other sessions are signed out), or set a first one if they have none (`POST /api/cms/account/password`).
- add or remove passkeys.

Language and time zone are stored on the user as better-auth fields `language` and `timezone`, validated on write. A host's own field of the same name replaces core's.

### Passkeys

Core registers better-auth's `passkey()` plugin with the host name of `site` as the relying party ID (`localhost` without `site`) and the admin `name` as its display name. Add your own `passkey()` to `auth.plugins` to configure it. It replaces core's. Adding a passkey needs a recent sign-in.

### Password reset

The admin's **Forgot password?** link sends a reset email and opens a form for a new password. It needs [email](./email.md) or your own `auth.emailAndPassword.sendResetPassword` callback.

- Requests show the same confirmation for existing and unknown accounts. Invalid or expired links offer a new request.
- Custom admin paths work, and a successful reset returns to sign-in.
- Host apps can use `client.requestPasswordReset({ email, redirectTo })` and `client.resetPassword({ token, newPassword })` for their own forms. `redirectTo` is the trusted URL of that form.
- better-auth checks password rules and token expiry, and uses a reset token once. Whether other sessions are revoked follows `auth.emailAndPassword.revokeSessionsOnPasswordReset`.

## Auth options

`auth` is [better-auth](https://better-auth.com)'s options object. It is better-auth's API and follows better-auth's versioning.

```ts
import { admin, twoFactor } from "better-auth/plugins";

defineCms({
  // …
  auth: {
    plugins: [admin(), twoFactor()],
    databaseHooks: { user: { create: { after: sendWelcome } } },
    session: { expiresIn: 60 * 60 * 24 * 30 },
  },
});
```

- Core owns `database`, `basePath` and `secret`. It always turns `emailAndPassword` on, because the admin login needs it. Your other email options stay.
- `modelName` is not accepted. Core reads the `user` table by name, so auth tables keep their default names.
- Only the first user can sign up without a session (`/auth-status` reports `setup`). After that, a request MAY create a user only with the session of a user whose role is `admin`, on every endpoint (email sign-up, social sign-in, magic link, other plugins). Anything else returns 403. Server code that calls better-auth without a request is trusted.
- Core's first-user rule runs before your `databaseHooks.user.create.before`.
- Tables of plugins are created at runtime on the first database access. There is no CLI step.

### Coming from Payload

The auth hooks map to better-auth's request hooks:

| Payload               | better-auth                                                 |
| --------------------- | ----------------------------------------------------------- |
| `beforeLogin`         | `hooks.before` with `ctx.path === '/sign-in/email'`         |
| `afterLogin`          | `hooks.after` with `ctx.path === '/sign-in/email'`          |
| `afterLogout`         | `hooks.after` with `ctx.path === '/sign-out'`               |
| `afterForgotPassword` | `hooks.after` with `ctx.path === '/request-password-reset'` |

```ts
import { createAuthMiddleware } from 'better-auth/api'

auth: {
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-in/email') console.log('signed in')
    }),
  },
}
```

## Users and roles

Every user has one role.

- `admin` manages users.
- `editor` and every other role edit content, unless [access rules](#access-control) say otherwise.
- The first user becomes an admin. Later users are editors unless an admin picks another role.
- A user without a role counts as `editor`.

Add your own roles, with a label for the admin:

```ts
defineCms({
  roles: {
    author: { label: { en: "Author", de: "Autor" }, description: "Writes posts" },
  },
});
```

Names MUST match `[a-z0-9-]`. `admin` and `editor` are built in and MUST NOT be listed. Hooks, plugin routes and loaders get the role as `user.role` (type `CmsUser`).

### The Users screen

**Users**, under Manage in the admin menu, is shown to admins. It lists users and pending invites in a pane. A click opens one next to it. An admin can:

- change a user's role (a dropdown)
- send a password reset (with email configured)
- sign a user out everywhere
- deactivate and reactivate a user (signed out, cannot sign in, content stays)
- remove a user

The last active admin cannot be demoted.

Core adds better-auth's [`admin()`](https://better-auth.com/docs/plugins/admin) plugin for this, with `admin` as the only role that manages users and no impersonation. Add your own `admin()` to `auth.plugins` to configure it. It replaces core's.

### Adding users

The "+" opens "New user" with two modes:

- **Set password** creates the user at once, with a name, a password and a role. The dice button fills in a random password and shows it. Pass the password on yourself.
- **Invite** asks for an email and a role. With email configured, the person gets a link. Without it, or when sending fails, the admin shows the link to copy and send yourself.

The link opens the admin's `/invite` page, where the person picks a name and password and is signed in. A link works once and expires after 7 days. Resending makes a new link and stops the old one. Revoking deletes the invite.

### Invite API

For custom screens:

| Route                              | Who    | Does                                                                          |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `GET /api/cms/invites`             | admins | Every invite, `expired` flagged. Tokens are never listed                      |
| `POST /api/cms/invites`            | admins | `{ email, role, url }`: creates and sends. `url` MUST be on the site's origin |
| `POST /api/cms/invites/:id/resend` | admins | `{ url }`: new link, sent again                                               |
| `DELETE /api/cms/invites/:id`      | admins | Revokes                                                                       |
| `POST /api/cms/invites/check`      | public | `{ token }`: `{ email, role, label }`, else 404                               |
| `POST /api/cms/invites/accept`     | public | `{ token, name, password }`: creates the user and sets the session cookie     |

- Create and resend answer `{ invite, link, sent }`. A 502 with the same body means sending failed and the invite stays.
- The client has `client.invites.list()`, `create()`, `resend()`, `revoke()`, `check()` and `accept()`.
- The public routes accept only `application/json`. Only the SHA-256 hash of a token is stored.

### Testing email locally

The Astro example accepts `SMTP_URL` and `EMAIL_FROM` (see `examples/astro/.env.example`). Set `SMTP_URL=smtp://127.0.0.1:1025` for a local email catcher on port 1025. Development permits a catcher without TLS. Production requires TLS. Start the example, choose **Forgot password?**, and open the link in the catcher's inbox.

## Access control

`access` decides who MAY read, create, update and delete. It works on collections, globals (`read`, `update`), the media library (`media.access`) and fields (`read`, `create`, `update`). A rule is `true`, `false`, a list of roles, or a function.

```ts
defineCollection({
  access: {
    create: ["admin", "editor", "author"],
    // An author changes only their own posts.
    update: ({ user }) => (user?.role === "author" ? { createdBy: user.id } : true),
    delete: ["admin", "editor"],
  },
  fields: {
    title: { type: "text" },
    note: { type: "text", access: { read: ["admin"], update: ["admin"] } },
  },
});
```

**Defaults and rules**

- Without a rule, everyone reads published content and signed-in users do the rest. A rule replaces that default, so `create: true` accepts writes without a session.
- A role list matches signed-in users with one of the roles. There is no admin bypass: `["editor"]` excludes `admin`. Unknown roles throw at startup.
- A function receives `{ user, cms, context, collection | global, locale }`, plus `draft` and `id` (read), `data` (create, update) or `id` (update, delete). It returns a boolean.
- `read`, `update` and `delete` MAY return a `where` instead: equality filters on top-level fields, `createdBy` and `updatedBy`. Reads only see matching documents. An update or delete of another document is denied.
- `update` covers draft saves, publish, discard and the locale actions.

**What it affects**

- Population and rich text links leave out documents the reader MAY NOT read.
- A field the caller MAY NOT read is missing from every result, and filtering on it is a 400.
- A field the caller MAY NOT create or update keeps its stored value. The input is dropped.
- Denied without a session answers 401. Denied with one answers 403 (`ForbiddenError`).
- The server `cms` and the `cms` that hooks get skip the rules. HTTP and `cms.withSession(request)` apply them.
- The admin hides what the user MAY NOT read, and shows read-only what they MAY NOT change. The server stays the authority.

Every document records `createdBy` and `updatedBy`: the ids of the users who created and last changed it (`null` for server code). Readers without a session do not get them.
