import type { BetterAuthOptions } from "better-auth";
import { consola } from "consola";

/** The sign-in methods `/auth-status` reports. */
export type SignInMethods = {
  password: boolean;
  passkeys: boolean;
  magicLink: boolean;
  emailOtp: boolean;
};

/**
 * Reads which sign-in methods are on. A magic link or email OTP counts only when it can send: its plugin has a sender,
 * or `hasEmail` says core adds one.
 */
export function signInMethods(
  options: Pick<BetterAuthOptions, "emailAndPassword" | "plugins">,
  hasEmail = false,
): SignInMethods {
  const canSend = (id: string, sender: string) => {
    const plugin = options.plugins?.find((p) => p.id === id);
    return !!plugin && (hasEmail || !!plugin.options?.[sender]);
  };
  return {
    password: options.emailAndPassword?.enabled !== false,
    passkeys: !!options.plugins?.some((p) => p.id === "passkey"),
    magicLink: canSend("magic-link", "sendMagicLink"),
    emailOtp: canSend("email-otp", "sendVerificationOTP"),
  };
}

/**
 * Checks the host's auth options at startup.
 * @throws When every sign-in method is off. Only email methods without email warn: `tenon users recover` still works.
 */
export function requireSignInMethod(
  host: Pick<BetterAuthOptions, "emailAndPassword" | "plugins">,
  hasEmail: boolean,
) {
  if (Object.values(signInMethods(host, hasEmail)).some(Boolean)) return;
  if (host.plugins?.some((p) => p.id === "magic-link" || p.id === "email-otp")) {
    consola
      .withTag("tenon")
      .warn(
        "Magic link and email OTP need `email`. Until it is set up, sign in with `tenon users recover <email>`.",
      );
    return;
  }
  throw new Error(
    "tenoncms: no sign-in method is on. Keep `auth.emailAndPassword` on, or add `passkey()`, `magicLink()` or `emailOTP()` to `auth.plugins`",
  );
}
