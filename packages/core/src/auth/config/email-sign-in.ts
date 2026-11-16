import type { BetterAuthPlugin } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";
import { magicLink } from "better-auth/plugins/magic-link";
import { emailTemplates } from "../../email/templates.ts";
import type { CoreAuth } from "./build-options.ts";

/**
 * Gives a host's `magic-link` or `email-otp` plugin without a sender core's email. Both plugins copy their options when
 * they are created, so this creates them again. Returns any other plugin as it is.
 */
export function withEmailSender(
  plugin: BetterAuthPlugin,
  email: NonNullable<CoreAuth["email"]>,
): BetterAuthPlugin {
  const { options } = plugin;
  if (plugin.id === "magic-link" && !options?.sendMagicLink)
    return magicLink({
      ...options,
      async sendMagicLink({ email: to, url }, ctx) {
        // Sign-up is closed after setup, so a link to an unknown address cannot sign anyone in.
        const found = await ctx?.context.internalAdapter.findUserByEmail(to);
        if (!found) return;
        const render = email.templates?.magicLink ?? emailTemplates.magicLink;
        await email.api.send({ ...(await render({ user: found.user, url })), to });
      },
    });
  if (plugin.id === "email-otp" && !options?.sendVerificationOTP)
    return emailOTP({
      ...options,
      async sendVerificationOTP(data) {
        const render = email.templates?.emailOtp ?? emailTemplates.emailOtp;
        await email.api.send({ ...(await render(data)), to: data.email });
      },
    });
  return plugin;
}
