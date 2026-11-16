import { APIError } from "better-auth/api";
import type { Core } from "../../cms/runtime/types.ts";
import { ConflictError } from "../../errors.ts";

// `Core` hides better-auth's API from the type checker, so the endpoints of `manageUsers()` are typed here.
type Api = Record<
  "deactivateUser" | "reactivateUser" | "removeUserByEmail",
  (context: { body: { email: string } }) => Promise<unknown>
>;

/**
 * Bans the user and ends their sessions, like better-auth's `banUser`. The ban does not expire.
 * @throws `ConflictError` for the last active admin, and better-auth's 404 for an unknown email.
 */
export const deactivateUser = (core: Core, email: string) =>
  callUserEndpoint(core, "deactivateUser", email);

/** Lifts the ban, like better-auth's `unbanUser`. @throws better-auth's 404 for an unknown email. */
export const reactivateUser = (core: Core, email: string) =>
  callUserEndpoint(core, "reactivateUser", email);

/**
 * Deletes the user with their sessions and accounts, like better-auth's `removeUser`. References in content stay.
 * @throws `ConflictError` for the last active admin, and better-auth's 404 for an unknown email.
 */
export const removeUser = (core: Core, email: string) =>
  callUserEndpoint(core, "removeUserByEmail", email);

async function callUserEndpoint(core: Core, name: keyof Api, email: string) {
  const { api } = (await core.auth()) as unknown as { api: Api };
  try {
    await api[name]({ body: { email } });
  } catch (error) {
    // Callers catch the 409 of the last admin as a `ConflictError`, like every other conflict.
    if (error instanceof APIError && error.status === "CONFLICT")
      throw new ConflictError([], error.message);
    throw error;
  }
}
