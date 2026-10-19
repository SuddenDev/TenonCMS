# email

Optional server-side delivery, shared by host code, hooks and plugin routes.

| File              | Responsibility                                                            |
| ----------------- | ------------------------------------------------------------------------- |
| `types.ts`        | Provider-neutral adapter, message, template, options and API contracts.   |
| `create-email.ts` | Instance-owned sender, message validation and adapter dispatch.           |
| `templates.ts`    | Default password-reset and verification text/HTML templates.              |
| `smtp.ts`         | Lazy Nodemailer SMTP transport; separate `integral-cms/email/smtp` entry. |

`defineCms({ email: { adapter, from, templates? } })` binds one `EmailApi`. Instances, `withDrafts()`, `withSession()` and scoped local APIs all share it. Without configuration, `email.send()` rejects without connecting to a provider or database.

`send()` validates recipient/header fields and requires a text or HTML body. It supplies the configured sender, strips unknown message keys and awaits `adapter.send()`. The adapter MUST reject delivery failures. SMTP also rejects partial recipient rejection; some recipients can already have accepted the message, so callers MUST NOT retry blindly.

Authentication assembly in `auth/config/build-options.ts` wires default callbacks when email is configured. `templates.resetPassword` and `templates.verifyEmail` can replace the renderers. Explicit Better Auth callbacks win. Verification requirements and automatic sends stay under the host's auth configuration.

The root imports no SMTP runtime. Nodemailer 10's ESM entry documents support for Workers with Node.js compatibility. Use implicit TLS on port 465 for Workers; port 25 is blocked. The CMS's overall Workers support remains a separate concern. SMTP pooling is intended for Node servers; Workers requests MUST NOT share open sockets.

`smtp()` accepts Nodemailer's native `SMTPPoolOptions`, which extends its ordinary `SMTPTransportOptions`. TLS, authentication, timeouts and pool settings pass to `createTransport()` unchanged. Explicit options override the adapter's `requireTLS: true` default.

Mail sends immediately. It is not queued, retried or rolled back with a content transaction. A hook can send before its surrounding write commits. Hosts that require reliable delivery after commit need an outbox or a separate delivery workflow.

There is no browser email method or generic send endpoint. Framework routes can import the CMS and call `cms.email.send()`. Plugin routes use `c.var.cms.email.send()` and existing `client.request()`. Endpoint owners MUST validate input, choose recipients/templates on the server and enforce authorization and abuse protection.
