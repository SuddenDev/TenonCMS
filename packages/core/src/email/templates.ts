import type { EmailTemplate, EmailTemplates, InviteTemplate } from "./types.ts";

/** Built-in password-reset, verification and invite emails, with plain text and escaped HTML. */
export const emailTemplates: EmailTemplates = {
  resetPassword: template("Reset your password", "Reset password"),
  verifyEmail: template("Verify your email address", "Verify email"),
  invite: invite(),
};

function invite(): InviteTemplate {
  return ({ role, url, inviter, site }) => {
    const line = (name: string, place: string, label: string) =>
      `${name} invited you to ${place} as ${label}.`;
    return {
      subject: `You are invited to ${site}`,
      text: `${line(inviter.name, site, role.label)}\n\nAccept the invitation: ${url}\n\nThe link expires in 7 days.`,
      html: `<p>${line(escape(inviter.name), escape(site), escape(role.label))}</p><p><a href="${escape(url)}">Accept the invitation</a></p><p>The link expires in 7 days.</p>`,
    };
  };
}

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
