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
