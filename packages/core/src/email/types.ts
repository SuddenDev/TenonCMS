/** Subject and bodies of an email. At least one body MUST be nonempty. */
export type EmailContent = {
  subject: string;
  text?: string;
  html?: string;
};

/** A complete message passed to an email adapter. */
export type EmailMessage = EmailContent & {
  from: string;
  to: string | string[];
  replyTo?: string;
};

/** Delivery transport. Resolves when the provider accepts the message; rejects on failure. */
export type EmailAdapter = {
  send(message: EmailMessage): Promise<void>;
};

/** Values passed to an authentication email template. */
export type EmailTemplateData = {
  user: { name: string; email: string };
  url: string;
};

/** Renders an authentication email on the server. */
export type EmailTemplate = (data: EmailTemplateData) => EmailContent | Promise<EmailContent>;

/** Values passed to the invite template. The invited person has no account yet. */
export type InviteTemplateData = {
  email: string;
  role: { name: string; label: string };
  url: string;
  /** Missing for an invite from server code or the CLI. */
  inviter?: { name: string; email: string };
  site: string;
};

/** Renders the invite email on the server. */
export type InviteTemplate = (data: InviteTemplateData) => EmailContent | Promise<EmailContent>;

/** Values passed to the email OTP template. */
export type EmailOtpTemplateData = {
  email: string;
  otp: string;
  /** What the code is for. A `change-email` code goes to the new address. */
  type: "sign-in" | "email-verification" | "forget-password" | "change-email";
};

/** Renders the email OTP email on the server. */
export type EmailOtpTemplate = (data: EmailOtpTemplateData) => EmailContent | Promise<EmailContent>;

/** Replacements for the built-in authentication and invite emails. */
export type EmailTemplates = {
  resetPassword: EmailTemplate;
  verifyEmail: EmailTemplate;
  invite: InviteTemplate;
  /** The link of `cms.users.signInLink()` and `tenon users recover`. It works once, for an hour. */
  signInLink: EmailTemplate;
  /** The link of `magicLink()`. Sent only to an existing user. */
  magicLink: EmailTemplate;
  /** The code of `emailOTP()`. */
  emailOtp: EmailOtpTemplate;
};

/** Optional server-side email delivery. No mail is sent without an adapter. */
export type EmailOptions = {
  adapter: EmailAdapter;
  /** Sender address, optionally with a display name, e.g. `Site <hello@example.com>`. */
  from: string;
  templates?: Partial<EmailTemplates>;
};

/** Server-only email methods. These send immediately, independently of content transactions. */
export type EmailApi = {
  /** Sends with the configured sender. Rejects without email configuration or when delivery fails. */
  send(message: Omit<EmailMessage, "from">): Promise<void>;
};
