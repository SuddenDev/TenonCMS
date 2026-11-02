# Auth, users and access

Three things live here: how people sign in, how users and roles work, and how you control who can do what with content.

## Signing in

The admin signs in at `/login`.

- While no user exists, every admin URL leads to `/signup`, which creates the first admin. After that, sign-up is closed: `/signup` redirects to `/login`, and the sign-in shows no sign-up link. New users join through [invites](#users-and-roles).
- `GET /_tenon/auth-status` answers `{ setup, signUp, passkeys }` for custom forms.
- The admin supports email and password, [passkeys](#passkeys), and password reset. Plugins that need other screens (2FA, magic link) work on the server but not in the admin yet.

### Account settings

**Account settings** in the user menu lets a user:

- edit their name, admin language and time zone. Dates in forms and the publication status follow the time zone. Empty follows the device.
- change the password (other sessions are signed out), or set a first one if they have none (`POST /_tenon/account/password`).
- add or remove passkeys, when they are on.

Language and time zone are stored on the user as better-auth fields `language` and `timezone`, validated on write. A host's own field of the same name replaces core's.

### Passkeys

Passkeys are off by default, because their WebAuthn libraries add about 600 KiB to the server bundle. Install `@better-auth/passkey` and add its plugin:

```ts
import { passkey } from "@better-auth/passkey";

export default defineCms({ auth: { plugins: [passkey()] } /* ... */ });
```

The admin then shows passkey sign-in and the passkey list in the account settings. The relying party ID is the host name of the request; pass `passkey({ rpID })` when the admin runs on a subdomain of the site. Its display name is better-auth's `appName`, which defaults to the admin `name`. Adding a passkey needs a recent sign-in.

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
- Set the site's origin as `baseURL` in production, or the `BETTER_AUTH_URL` environment variable. Without it, better-auth takes the origin from each request and logs "Base URL is not set" on start. Core does not set it, because the CMS MAY run on another origin than `site`. For several hosts, use better-auth's dynamic `baseURL` with `allowedHosts`.
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

| Route                             | Who    | Does                                                                          |
| --------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `GET /_tenon/invites`             | admins | Every invite, `expired` flagged. Tokens are never listed                      |
| `POST /_tenon/invites`            | admins | `{ email, role, url }`: creates and sends. `url` MUST be on the site's origin |
| `POST /_tenon/invites/:id/resend` | admins | `{ url }`: new link, sent again                                               |
| `DELETE /_tenon/invites/:id`      | admins | Revokes                                                                       |
| `POST /_tenon/invites/check`      | public | `{ token }`: `{ email, role, label }`, else 404                               |
| `POST /_tenon/invites/accept`     | public | `{ token, name, password }`: creates the user and sets the session cookie     |

- Create and resend answer `{ invite, link, sent }`. A 502 with the same body means sending failed and the invite stays.
- The client has `client.invites.list()`, `create()`, `resend()`, `revoke()`, `check()` and `accept()`.
- The public routes accept only `application/json`. Only the SHA-256 hash of a token is stored.

### Testing email locally

The Astro example accepts `SMTP_URL` and `EMAIL_FROM` (see `examples/astro/.env.example`). Set `SMTP_URL=smtp://127.0.0.1:1025` for a local email catcher on port 1025. Development permits a catcher without TLS. Production requires TLS. Start the example, choose **Forgot password?**, and open the link in the catcher's inbox.

## API keys

An API key lets a script or another service use the API without signing in. Examples: a build that reads content, or a shop module that syncs products.

- A key is its own caller, not a user. The admin who created it is recorded, but the key does not act as them.
- A grid on the key decides what it MAY do (see below).
- A key reads published content only. The preview cookie is ignored.
- A key that is unknown, revoked or expired gets 401. It never falls back to a visitor's read.
- Only a hash of the key is stored. The key itself is shown once, when it is created.

Send the key as `x-api-key`, or pass it to the client. Keep keys on the server: a key MUST NOT reach a browser.

```ts
import { createClient } from "tenoncms/client";

const client = createClient({ baseUrl: "https://example.com", apiKey: process.env.CMS_API_KEY });
const posts = await client.find("posts");
```

**The grid**

A key holds operations per target, picked at creation:

```ts
{
  "collection:posts": ["create", "read", "update", "delete"],
  "collection:media": ["read", "create"],
  "global:site": ["read", "update"],
  schema: ["read"],
}
```

- Every collection takes `create`, `read`, `update` and `delete`, plugin collections and `media` included. A media upload needs `create` on `collection:media`, and so do its parts and its abort.
- Every global takes `read` and `update`. `schema` takes `read`: `GET /_tenon/schema`, with `access` showing what the key MAY do.
- A target the key does not hold is a 403. A collection added later is not granted to existing keys.
- Unknown targets and operations are a 400 at creation.

**Access rules and keys**

The grid is checked first, in the local API, so it holds for `cms.withSession(request)` too. Then the target's rule:

| Rule             | For a key                                                   |
| ---------------- | ----------------------------------------------------------- |
| missing          | Allowed: the grid replaces the default                      |
| a list of roles  | Allowed: the grid replaces it                               |
| `true` / `false` | As written, so `delete: false` holds for keys too           |
| a function       | Runs with `user: null` and `apiKey`, so it MAY narrow a key |

Field rules run as for a visitor: a role list or `private` hides the field from a key, a function rule decides. Rules and hooks get `apiKey` as `{ id, name, permissions }`.

```ts
access: {
  update: ({ user, apiKey }) => !!user || apiKey?.name === "Shop sync",
}
```

**Authors**

`createdBy` and `updatedBy` hold `key:<id>` for a key's writes. Filter on it like on a user id: `where: { createdBy: "key:abc" }`. A key reads `createdBy` and `updatedBy`.

**What a key never reaches**

A key never reads drafts. Previews, users, invites, passwords, key management, plugin `routes` and better-auth's own routes answer 403 to a key. Plugin `middleware` does not run for a key, as for a visitor. Public plugin routes work as for anyone.

**Managing keys**

**API keys**, under Manage in the admin menu, is for admins only. It creates keys with the grid, and shows each key's grid, creator, last use and state.

- **Roll** gives a key a new secret. The old one stops at once. The id, grid, expiry and `key:<id>` authors stay.
- **Revoke** disables a key at once. It stays listed, so `key:<id>` in `createdBy` keeps a name.
- **Delete** removes it for good.

| Route                              | Does                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `GET /_tenon/api-keys`             | Every key, revoked ones included, with `permissions`, `creator`, `enabled` |
| `POST /_tenon/api-keys`            | `{ name, permissions, expiresIn? }`: the new key with `key`                |
| `POST /_tenon/api-keys/:id/roll`   | A new secret for an active key: the key with `key`. A revoked key is a 404 |
| `POST /_tenon/api-keys/:id/revoke` | Disables the key                                                           |
| `DELETE /_tenon/api-keys/:id`      | Deletes the key                                                            |

`expiresIn` is in seconds, from 1 to 365 days. Without it, the key does not expire. The client has `client.apiKeys.list()`, `create()`, `roll()`, `revoke()` and `delete()`. These routes need an admin's session: a key cannot manage keys.

Core adds better-auth's [`apiKey()`](https://better-auth.com/docs/plugins/api-key) plugin without its per-key rate limit and without sessions for keys. Its own `/_tenon/auth/api-key/*` routes are closed.

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
