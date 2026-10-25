/** Criteria the sign-up form shows as hints. Only the length is enforced, by the server. */
export function passwordChecks(password: string) {
  return {
    length: password.length >= 8,
    lowercase: /\p{Ll}/u.test(password),
    uppercase: /\p{Lu}/u.test(password),
    number: /\p{N}/u.test(password),
    special: /[^\p{L}\p{N}\s]/u.test(password),
  };
}

export type PasswordChecks = ReturnType<typeof passwordChecks>;

/** One point per met criterion, from 0 to 5. */
export const passwordStrength = (checks: PasswordChecks) =>
  Object.values(checks).filter(Boolean).length;

// 64 characters, so a random byte maps to one without bias.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-!$?*";

/** 20 random characters (120 bits) that meet every criterion, for a password an admin hands on. */
export function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const password = Array.from(bytes, (b) => ALPHABET[b % 64]).join("");
  return passwordStrength(passwordChecks(password)) === 5 ? password : randomPassword();
}
