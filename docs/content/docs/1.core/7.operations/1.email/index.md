---
title: Email
description: Send account emails and your own messages.
navigation:
  title: Overview
---

Tenon has first-party email support with multiple adapters for sending. It uses it "internally" to send the better-auth emails like for password resets, invites and sign-in links. Your own server code can also send mail through the same setup, for example for a contact form. This page shows how to send your own messages and change the built-in emails. The provider pages show how to set up each adapter.

::note
Email is optional. Without it, Tenon still runs:
::

| Feature                     | Without email                                               |
| --------------------------- | ----------------------------------------------------------- |
| Invites                     | The admin shows the invite link, and you pass it on.        |
| **Forgot password?**        | Sends nothing. Run `tenon users recover` instead.           |
| Magic links and email codes | Off. Tenon warns at startup when they are the only methods. |
| `cms.email.send()`          | Throws a configuration error.                               |

## Pick a provider

Tenon has currently two built-in adapters. `create-tenoncms` sets up either one when you choose it.

| Adapter                                                       | Sends through            | Runs on                  | Needs                    |
| ------------------------------------------------------------- | ------------------------ | ------------------------ | ------------------------ |
| [`smtp()`](/docs/core/operations/email/smtp)                  | Any SMTP server          | Node, Vercel and Workers | The `nodemailer` package |
| [`cloudflareEmail()`](/docs/core/operations/email/cloudflare) | Cloudflare Email Service | Node, Vercel and Workers | A domain onboarded to it |

For any other provider, write a [custom adapter](/docs/core/operations/email/custom-adapter).

## Send from your code

Any server code can send with `cms.email.send()`, for example a framework route or a hook:

```ts [server/contact.ts]
import cms from "../tenon.config";

await cms.email.send({
  to: "team@example.com",
  replyTo: "reader@example.com",
  subject: "Contact request",
  text: "I would like to know more.",
  html: "<p>I would like to know more.</p>",
});
```

- `to` takes one address or a list.
- A message needs `text`, `html` or both.
- `send()` waits for the mail server. If the server refuses the message, `send()` throws.
- A server that accepts a message does not promise that it reaches the inbox. With several recipients, some can accept and others refuse. Do not send again blindly, or some people get the mail twice.

::warning
Mail is sent at once. It is not queued, not retried and not undone when a write rolls back. A hook can send before its write commits. If the mail MUST wait for the commit, queue a [job](/docs/core/operations/jobs) from the hook and send from the job.
::

### Send from the browser

Tenon has no email route for the browser. Write your own route that validates the input and calls `cms.email.send()`, then call it with `fetch()`. A [plugin](/docs/core/customization/plugins) can add the route too. Its handler gets the CMS as `c.var.cms`.

::caution
Your route decides who gets the mail and what it says. Never take the recipient or the HTML from the request. Protect a public form against spam, for example with a rate limit or a captcha.
::

## Change the built-in emails

Each built-in email has a default text and HTML template. To replace one, set a function in `templates`. It returns `{ subject, text, html }` and MAY be async:

```ts [tenon.config.ts]
email: {
  adapter: smtp({ /* ... */ }),
  from: "My Site <hello@example.com>",
  templates: {
    resetPassword: ({ user, url }) => ({
      subject: "Reset your password",
      text: `Hello ${user.name}, reset your password: ${url}`,
    }),
    invite: ({ role, url, inviter, site }) => ({
      subject: `Join ${site}`,
      text: `${inviter?.name ?? "We"} invited you as ${role.label}: ${url}`,
    }),
  },
},
```

| Template        | Sent for                                                                             | Gets                                      |
| --------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- |
| `resetPassword` | **Forgot password?**                                                                 | `user`, `url`                             |
| `verifyEmail`   | Email verification, when you turn it on in `auth`                                    | `user`, `url`                             |
| `invite`        | An invite. No account exists yet                                                     | `email`, `role`, `url`, `inviter`, `site` |
| `signInLink`    | `tenon users recover` and `cms.users.signInLink()`. The link works once, for an hour | `user`, `url`                             |
| `magicLink`     | A sign-in with `magicLink()`                                                         | `user`, `url`                             |
| `emailOtp`      | A code from `emailOTP()`                                                             | `email`, `otp`, `type`                    |

- `inviter` is missing for an invite from server code or the CLI.
- `type` of `emailOtp` is `"sign-in"`, `"email-verification"`, `"forget-password"` or `"change-email"`.
- The default templates escape names and URLs in HTML. Your templates MUST escape every value they put into HTML.
- A send callback that you set in `auth` yourself, like `emailAndPassword.sendResetPassword`, wins over the template.

## Add your own template

`templates` takes only the built-in emails above. A template for your own mail is a plain function that returns `{ subject, text, html }`. Type it with `EmailContent`:

```ts [server/emails/contact.ts]
import type { EmailContent } from "tenoncms";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export function contactEmail(input: { name: string; message: string }): EmailContent {
  return {
    subject: "Contact request",
    text: `${input.name} wrote:\n\n${input.message}`,
    html: `<p>${escapeHtml(input.name)} wrote:</p><p>${escapeHtml(input.message)}</p>`,
  };
}
```

Spread its result into `cms.email.send()`:

```ts [server/contact.ts]
import cms from "../tenon.config";
import { contactEmail } from "./emails/contact";

await cms.email.send({
  to: "team@example.com",
  ...contactEmail({ name: "Ada", message: "I would like to know more." }),
});
```

- Tenon has no escape helper for your templates. Escape every value you put into HTML.
- `subject` MUST be one line. `send()` throws on a line break.

## Related resources

- [Authentication](/docs/core/users-and-access/authentication): the sign-in methods that send email.
- [Jobs](/docs/core/operations/jobs): send mail after a write commits.
- [tenon users](/docs/cli/users): invites and recovery from the command line.
- [Cloudflare](/docs/guide/deployment/cloudflare): bindings for email, media and images on Workers.
