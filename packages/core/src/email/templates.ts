import type { EmailTemplate, EmailTemplates } from "./types.ts";

/** Built-in password-reset and verification emails, with plain text and escaped HTML. */
export const emailTemplates: EmailTemplates = {
  resetPassword: template("Reset your password", "Reset password"),
  verifyEmail: template("Verify your email address", "Verify email"),
};

function template(subject: string, action: string): EmailTemplate {
  return ({ user, url }) => ({
    subject,
    text: `Hello ${user.name},\n\n${action}: ${url}\n\nIf you did not request this email, you can ignore it.`,
    html: `<p>Hello ${escape(user.name)},</p><p><a href="${escape(url)}">${action}</a></p><p>If you did not request this email, you can ignore it.</p>`,
  });
}

function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}
