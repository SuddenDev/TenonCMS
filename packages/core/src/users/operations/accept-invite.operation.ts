import type { BetterAuthOptions } from "better-auth";
import { HTTPException } from "hono/http-exception";
import { ValidationError } from "../../errors.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Core } from "../../cms/runtime/types.ts";
import { claimInvite } from "../../db/queries/invites/claim-invite.query.ts";
import { insertInvite } from "../../db/queries/invites/insert-invite.query.ts";
import { notFound } from "../../http/errors.ts";
import { lengthProblem } from "../../auth/config/password-length.ts";
import { hashToken } from "../token.ts";

// `Core` hides better-auth's API from the type checker, so the two methods are typed here.
type Api = {
  createUser(context: { body: object }): Promise<unknown>;
  signInEmail(context: {
    body: { email: string; password: string };
    returnHeaders: true;
  }): Promise<{ headers: Headers; response: { user: object } }>;
};

/**
 * Creates the user of an invite and signs them in. The invite is claimed first, so one token creates one user;
 * better-auth runs its own transactions, so a failed create puts the invite back.
 * @returns The new user and the session cookies to forward.
 * @throws {HTTPException} 404 for an unknown, used or expired token; better-auth's status for a rejected user, e.g.
 * 400 for a short password.
 */
export async function acceptInvite(
  core: Core,
  { token, name, password }: { token: string; name: string; password: string },
) {
  const auth = await core.auth();
  checkPassword(password, auth.options);

  // Claim first, so a second request with the same token finds nothing.
  const db = await core.db();
  const invite = await claimInvite(db, await hashToken(token), Date.now());
  if (!invite) throw notFound();

  const { api } = auth as unknown as { api: Api };
  const { email, role } = invite;
  try {
    // A call without headers is trusted, so it passes core's sign-up check.
    await api.createUser({ body: { email, name, password, role, data: { emailVerified: true } } });
  } catch (error) {
    await insertInvite(db, invite);
    throw asHttp(error);
  }

  const { headers, response } = await api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  return { user: response.user, headers };
}

function checkPassword(password: string, options: BetterAuthOptions) {
  const problem = lengthProblem(password, options);
  if (problem) throw new ValidationError({ password: problem });
}

// better-auth's `APIError` has a status code and a message for the client.
function asHttp(error: unknown) {
  const e = error as { statusCode?: number; body?: { message?: string } };
  if (typeof e?.statusCode !== "number") return error;
  return new HTTPException(e.statusCode as ContentfulStatusCode, {
    message: e.body?.message ?? "Invalid invite acceptance",
  });
}
