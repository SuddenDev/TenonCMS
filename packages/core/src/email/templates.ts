import type {
  EmailOtpTemplate,
  EmailOtpTemplateData,
  EmailTemplate,
  EmailTemplates,
  InviteTemplate,
} from "./types.ts";

/** Built-in password-reset, verification, invite and sign-in emails, with plain text and escaped HTML. */
export const emailTemplates: EmailTemplates = {
  resetPassword: template("Reset your password", "Reset password"),
  verifyEmail: template("Verify your email address", "Verify email"),
  invite: invite(),
  signInLink: template("Your sign-in link", "Sign in"),
  magicLink: template("Your sign-in link", "Sign in"),
  emailOtp: emailOtp(),
};

const otpWords: Record<EmailOtpTemplateData["type"], [subject: string, code: string]> = {
  "sign-in": ["Your sign-in code", "Your sign-in code"],
  "email-verification": ["Verify your email address", "Your verification code"],
  "forget-password": ["Reset your password", "Your password reset code"],
  "change-email": ["Confirm your new email address", "Your code to confirm this address"],
};

function emailOtp(): EmailOtpTemplate {
  return ({ otp, type }) => {
    const [subject, code] = otpWords[type];
    const ignore = "If you did not request this code, you can ignore this email.";
    return {
      subject,
      text: `${code}: ${otp}\n\n${ignore}`,
      html: `<p>${code}:</p><p><strong>${escape(otp)}</strong></p><p>${ignore}</p>`,
    };
  };
}

function invite(): InviteTemplate {
  return ({ role, url, inviter, site }) => {
    const line = (name: string | undefined, place: string, label: string) =>
      `${name ? `${name} invited you` : "You are invited"} to ${place} as ${label}.`;
    return {
      subject: `You are invited to ${site}`,
      text: `${line(inviter?.name, site, role.label)}\n\nAccept the invitation: ${url}\n\nThe link expires in 7 days.`,
      html: `<p>${line(inviter && escape(inviter.name), escape(site), escape(role.label))}</p><p><a href="${escape(url)}">Accept the invitation</a></p><p>The link expires in 7 days.</p>`,
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
