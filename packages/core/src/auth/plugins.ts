import { emailOTP as betterEmailOTP, type EmailOTPOptions } from "better-auth/plugins/email-otp";
import {
  magicLink as betterMagicLink,
  type MagicLinkOptions,
} from "better-auth/plugins/magic-link";

/**
 * better-auth's `magicLink()`: sign-in with a link in an email. Without `sendMagicLink`, core sends its `magicLink`
 * email when `email` is set up. Sign-up stays off unless `disableSignUp: false`.
 */
export const magicLink = (options: Partial<MagicLinkOptions> = {}) =>
  betterMagicLink({ disableSignUp: true, ...options } as MagicLinkOptions);

/**
 * better-auth's `emailOTP()`: sign-in with a code in an email. Without `sendVerificationOTP`, core sends its
 * `emailOtp` email when `email` is set up. Sign-up stays off unless `disableSignUp: false`.
 */
export const emailOTP = (options: Partial<EmailOTPOptions> = {}) =>
  betterEmailOTP({ disableSignUp: true, ...options } as EmailOTPOptions);
