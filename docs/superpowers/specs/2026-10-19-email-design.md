# Email delivery

## Scope

Add optional server-side email delivery to `defineCms()`. SMTP is the first adapter. A host can implement an HTTP provider by supplying the same `EmailAdapter` contract. The browser cannot send arbitrary mail through the CMS.

## Public API

`email: { adapter, from, templates? }` configures delivery. `integral-cms/email/smtp` exports `smtp(options)`, backed by Nodemailer. Core exports provider-neutral email types. SMTP code is isolated from the root and browser entries.

`cms.email.send({ to, subject, text?, html?, replyTo? })` sends immediately and awaits the adapter. It is available on instances, session/draft instances and the local API supplied to hooks and plugin routes. Without email configuration it rejects with a configuration error. Messages require a recipient, subject and at least one body. Adapter messages include the configured sender. Adapter errors propagate; delivery has no automatic retries or transaction rollback semantics.

The adapter contract is `send(message): Promise<void>`. Its message uses ordinary strings and recipient arrays, without provider-specific fields. No SMTP connection opens until a send.

## Templates and authentication

Default password-reset and email-verification templates render subject, plain text and escaped HTML. `email.templates.resetPassword` and `email.templates.verifyEmail` replace a template with a synchronous or asynchronous function receiving `{ user: { name, email }, url }`.

When email is configured, Better Auth receives send callbacks for password reset and email verification. Explicit host callbacks take precedence. Verification requirements and send-on-sign-up behavior remain the host's Better Auth options. This feature does not implement auth screens, invites or magic-link activation.

## Host endpoints

Astro routes and Nuxt server endpoints import the instance and call `cms.email.send()` directly. Their browser callers use `fetch()` or `$fetch()`. They own validation, authorization and abuse protection.

Existing plugin `routes` and `publicRoutes` also work, including dynamic path parameters. Their handlers call `c.var.cms.email.send()` and browser callers use `client.request()`. Route registration remains at initialization. No new route registry, generic send endpoint or client mail method is needed.

## Verification

Test adapter dispatch and failures, invalid messages, isolated instances, default template escaping and replacement, host callback precedence, auth delivery and a client-triggered dynamic route. Mock the SMTP boundary to check lazy construction, message forwarding and failure behavior. Run the repository tests, lint, package builds and workspace typechecks. Document framework-native and plugin route usage, including the immediate-send limitation.
