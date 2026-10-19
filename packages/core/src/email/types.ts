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

/** Replacements for the built-in authentication emails. */
export type EmailTemplates = {
  resetPassword: EmailTemplate;
  verifyEmail: EmailTemplate;
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
