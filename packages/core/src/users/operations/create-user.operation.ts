import type { Core } from "../../cms/runtime/types.ts";

type CreatedUser = { id: string; email: string; name: string; role?: string | null };

// `Core` hides better-auth's API from the type checker, so the method is typed here.
type Api = { createUser(context: { body: object }): Promise<{ user: CreatedUser }> };

/**
 * Creates a user without a request, so core's sign-up check trusts it. The first user becomes an admin, whatever
 * `role` says. Without `password` the user has no password and signs in another way, e.g. with a sign-in link.
 * The email counts as verified unless `data.emailVerified` is `false`. better-auth deletes the password and the
 * sessions of an unverified user on their first magic link or email code.
 * @throws better-auth's `APIError`, e.g. for a taken email or a password of the wrong length.
 */
export async function createUser(
  core: Core,
  input: {
    email: string;
    name: string;
    role?: string;
    password?: string;
    /** Further user fields, e.g. `emailVerified`. */
    data?: Record<string, unknown>;
  },
): Promise<CreatedUser> {
  const { api } = (await core.auth()) as unknown as { api: Api };
  const data = { emailVerified: true, ...input.data };
  const { user } = await api.createUser({
    body: { ...input, email: input.email.toLowerCase(), data },
  });
  return user;
}
