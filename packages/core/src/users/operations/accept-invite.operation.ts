import type { BetterAuthOptions } from "better-auth";
import { ValidationError } from "../../errors.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { claimInvite } from "../../db/queries/invites/claim-invite.query.ts";
import { insertInvite } from "../../db/queries/invites/insert-invite.query.ts";
import { notFound } from "../../http/errors.ts";
import { lengthProblem } from "../../auth/config/password-length.ts";
import { signInMethods } from "../../auth/config/sign-in-methods.ts";
import { hashToken } from "../token.ts";
import { createAndSignIn } from "./create-and-sign-in.operation.ts";

/**
 * Creates the user of an invite and signs them in. The invite is claimed first, so one token creates one user;
 * better-auth runs its own transactions, so a failed create puts the invite back.
 * @param password Required while password is the only sign-in method, optional next to another one, refused while
 *   password sign-in is off.
 * @returns The new user and the session cookies to forward.
 * @throws {ValidationError} For a missing, refused or wrong-length password.
 * @throws {HTTPException} 404 for an unknown, used or expired token; better-auth's status for a rejected user.
 */
export async function acceptInvite(
  core: Core,
  { token, name, password }: { token: string; name: string; password?: string },
) {
  checkPassword(password, (await core.auth()).options);

  // Claim first, so a second request with the same token finds nothing.
  const db = await core.db();
  const invite = await claimInvite(db, await hashToken(token), Date.now());
  if (!invite) throw notFound();

  const { email, role } = invite;
  // The link proved the address.
  const data = { emailVerified: true };
  return createAndSignIn(core, { email, name, role, password, data }, () =>
    insertInvite(db, invite),
  );
}

function checkPassword(password: string | undefined, options: BetterAuthOptions) {
  const { password: on, ...others } = signInMethods(options);
  if (!on) {
    if (password !== undefined)
      throw new ValidationError({ password: "MUST NOT be set while password sign-in is off" });
    return;
  }
  // Another method signs the user in, so they MAY set a password later or never.
  if (password === undefined && Object.values(others).some(Boolean)) return;
  const problem = lengthProblem(password ?? "", options);
  if (problem) throw new ValidationError({ password: problem });
}
