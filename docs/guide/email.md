# Email

Email is optional and runs on the server. The CMS uses it for password resets, email verification and invites. Your own code can send mail too.

## Configure

Set a transport and a sender once:

```ts
import { defineCms } from "integral-cms";
import { smtp } from "integral-cms/email/smtp";

export default defineCms({
  // Your collections, database and secret…
  email: {
    adapter: smtp({
      host: process.env.SMTP_HOST,
      port: 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    }),
    from: "My Site <hello@example.com>",
  },
});
```

- `smtp()` uses Nodemailer 10's ESM build and connects only when sending.
- For STARTTLS, use port 587 and `secure: false`. The adapter requires TLS by default.
- Workers: Nodemailer documents support with Node.js compatibility. Use port 465 with `secure: true` and leave pooling off. Port 25 is blocked. This does not enable the CMS's other planned Workers features.

`smtp()` passes Nodemailer's native options through to `nodemailer.createTransport()`: authentication, TLS, timeouts, pooling. Your options override the adapter's `requireTLS: true` default.

```ts
adapter: smtp({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  connectionTimeout: 10_000,
  tls: { minVersion: "TLSv1.2" },
}),
```

## Send from your code

Any server code can send, including an Astro route or a Nuxt server endpoint, without a plugin:

```ts
import cms from "./integral.config";

await cms.email.send({
  to: "team@example.com",
  replyTo: "reader@example.com",
  subject: "Contact request",
  text: "I would like to know more.",
  html: "<p>I would like to know more.</p>",
});
```

- `to` accepts a string or an array. Supply `text`, `html`, or both. The configured `from` applies to every message.
- Without email configuration, sending rejects with a configuration error. SMTP and adapter failures reject the call too.
- SMTP acceptance does not guarantee inbox delivery. Some recipients can be rejected after others accept the message.
- Sending awaits the provider right away. There is no queue and no automatic retry. In a hook it can happen before the content transaction commits, and it cannot be rolled back. Use a separate delivery workflow when mail must depend on a successful commit.

### From the browser

There is no generic browser email endpoint. Call a framework endpoint with `fetch()` or Nuxt's `$fetch()`. Or register one through a plugin, using `publicRoutes` or the session-protected `routes` (dynamic paths such as `/:topic` work), and call it with `client.request('/contact/sales', { method: 'POST', body })`. Its handler sends through `c.var.cms.email.send()`.

Hosts MUST validate input, choose recipients and templates on the server, and enforce authorization and abuse protection on submission endpoints.

## Templates for account emails

With email configured, password-reset, email-verification and invite emails use default text and HTML templates. Replace any of them with a function returning `{ subject, text?, html? }`. Async functions work too:

```ts
email: {
  adapter: smtp({ /* SMTP options */ }),
  from: "My Site <hello@example.com>",
  templates: {
    resetPassword: ({ user, url }) => ({
      subject: "Reset your password",
      text: `Hello ${user.name}, reset your password: ${url}`,
    }),
    verifyEmail: ({ user, url }) => ({
      subject: "Verify your email",
      text: `Hello ${user.name}, verify your email: ${url}`,
    }),
    // No account exists yet, so an invite gets the email, role, inviter and site name instead of a user.
    invite: ({ role, url, inviter, site }) => ({
      subject: `Join ${site}`,
      text: `${inviter.name} invited you as ${role.label}: ${url}`,
    }),
  },
}
```

- The defaults escape names and URLs in HTML. Replacement templates MUST escape any values they put into HTML.
- Explicit `auth.emailAndPassword.sendResetPassword` and `auth.emailVerification.sendVerificationEmail` callbacks take precedence.
- Requiring verification, or sending it on sign-up, stays an explicit better-auth option.
- Magic-link sign-in is a separate feature.

## Use another provider

Implement `EmailAdapter` from `integral-cms`:

```ts
import type { EmailAdapter } from "integral-cms";

const adapter: EmailAdapter = {
  async send(message) {
    const response = await fetch("https://your-provider.example/send", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error("Email delivery failed");
  },
};
```

`message` contains `from`, `to`, `subject`, an optional `replyTo`, and text and HTML bodies. Map it to the provider's API as needed. Core imports no SMTP runtime unless the host imports `integral-cms/email/smtp`.
