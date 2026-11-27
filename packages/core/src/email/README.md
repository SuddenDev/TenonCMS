# email

Optional server-side delivery, shared by host code, hooks and plugin routes.

| File              | Responsibility                                                              |
| ----------------- | --------------------------------------------------------------------------- |
| `types.ts`        | Provider-neutral adapter, message, template, options and API contracts.     |
| `create-email.ts` | Instance-owned sender, message validation and adapter dispatch.             |
| `templates.ts`    | Default account, invite, sign-in link and email OTP text/HTML templates.    |
| `smtp.ts`         | Lazy Nodemailer SMTP transport; separate `tenoncms/email/smtp` entry.       |
| `cloudflare.ts`   | Cloudflare Email Service, binding or REST API; `tenoncms/email/cloudflare`. |

`defineCms({ email: { adapter, from, templates? } })` binds one `EmailApi`. Instances, `withDrafts()`, `withSession()` and scoped local APIs all share it. Without configuration, `email.send()` rejects without connecting to a provider or database.

`send()` validates recipient/header fields and requires a text or HTML body. It supplies the configured sender, strips unknown message keys and awaits `adapter.send()`. The adapter MUST reject delivery failures. SMTP also rejects partial recipient rejection; some recipients can already have accepted the message, so callers MUST NOT retry blindly.

Authentication assembly in `auth/config/build-options.ts` wires default callbacks when email is configured. `templates.resetPassword` and `templates.verifyEmail` can replace the renderers. Explicit Better Auth callbacks win. `templates.invite` gets `InviteTemplateData` (`email`, `role`, `url`, `inviter`, `site`), because no user exists yet; `inviter` is missing for an invite from server code. `templates.signInLink` renders the link of `cms.users.signInLink()`; `templates.magicLink` the link of `magicLink()`, and `templates.emailOtp` the code of `emailOTP()` with its `type`, both sent by `auth/config/email-sign-in.ts`; `Core.emailTemplates` holds the defaults merged with the host's, and `users/operations/send-invite.operation.ts` renders it. Verification requirements and automatic sends stay under the host's auth configuration.

The root imports no SMTP runtime. `nodemailer` is an optional peer dependency: the host installs it to use `smtp()`. On Workers (`navigator.userAgent` is `Cloudflare-Workers`), `smtp()` gives Nodemailer a `getSocket` that opens the socket by host name. Nodemailer's own lookup MUST NOT run there: workerd's `node:dns` returns CNAME targets as addresses, and a TLS socket opened by IP fails the certificate check. Port 25 is blocked. SMTP pooling is intended for Node servers; Workers requests MUST NOT share open sockets.

`smtp()` accepts Nodemailer's native `SMTPPoolOptions`, which extends its ordinary `SMTPTransportOptions`. TLS, authentication, timeouts and pool settings pass to `createTransport()` unchanged. Explicit options override the adapter's `requireTLS: true` default.

`cloudflareEmail()` has the two modes of `r2()`: a `send_email` binding, or an object with `accountId` for the REST API. The binding is typed structurally (`SendEmailBinding`), so core needs no Workers types. Cloudflare takes a display name only as an object, so `Name <address>` becomes `{ name, email }` for the binding and `{ address, name }` for the API. The API documents `reply_to` as a plain address, so the API mode drops its display name.

- A binding error carries a `code` and rejects unchanged. `wrangler dev` simulates the binding and only logs mail, unless the binding has `remote: true`.
- The API mode validates the answer with zod. It rejects a non-2xx status or `success: false` with Cloudflare's error number as `code`, and a non-empty `permanent_bounces` like SMTP's partial rejection: callers MUST NOT retry blindly.
- A missing binding, `accountId` or `apiToken` rejects at send, not at startup, so a build without the variables still works.

Mail sends immediately. It is not queued, retried or rolled back with a content transaction. A hook can send before its surrounding write commits. Hosts that require reliable delivery after commit need an outbox or a separate delivery workflow.

There is no browser email method or generic send endpoint. Framework routes can import the CMS and call `cms.email.send()`. Plugin routes use `c.var.cms.email.send()` and existing `client.request()`. Endpoint owners MUST validate input, choose recipients/templates on the server and enforce authorization and abuse protection.
