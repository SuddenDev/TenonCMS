import { HTTPException } from "hono/http-exception";
import type { CmsUser } from "../../admin/index.d.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Db } from "../../db/queries/document-sql.ts";
import { deleteInvite } from "../../db/queries/invites/delete-invite.query.ts";
import { insertInvite } from "../../db/queries/invites/insert-invite.query.ts";
import { inviteByEmail } from "../../db/queries/invites/invite-by-email.query.ts";
import { userExists } from "../../db/queries/users/user-exists.query.ts";
import { ValidationError } from "../../errors.ts";
import { INVITE_TTL } from "../invite.ts";
import { inviteLink } from "../invite-url.ts";
import { hashToken, newToken } from "../token.ts";
import { sendInvite } from "./send-invite.operation.ts";

/**
 * Invites `email` with `role` and sends the invite. An expired invite for the email is replaced.
 * @param origin The origin the invite page MUST be on.
 * @throws {ValidationError} For an unknown role or a page on another origin.
 * @throws {HTTPException} 409 when a user or a pending invite has the email.
 */
export async function createInvite(
  core: Core,
  inviter: CmsUser,
  input: { email: string; role: string; url: string },
  origin: string,
) {
  if (!core.roles.some((r) => r.name === input.role))
    throw new ValidationError({ role: "Unknown role" });
  const token = newToken();
  const link = inviteLink(input.url, token, origin);
  const email = input.email.toLowerCase();
  const db = await core.db();
  const now = Date.now();

  await assertFree(db, email, now);

  const row = {
    id: crypto.randomUUID(),
    email,
    role: input.role,
    token_hash: await hashToken(token),
    invited_by: inviter.id,
    expires_at: now + INVITE_TTL,
    created_at: now,
  };
  await insertInvite(db, row);
  return sendInvite(core, inviter, row, link);
}

// An expired invite for the email is deleted, so a new one can take its place.
async function assertFree(db: Db, email: string, now: number) {
  if (await userExists(db, email))
    throw new HTTPException(409, { message: "A user with this email exists" });
  const existing = await inviteByEmail(db, email);
  if (existing && existing.expires_at > now)
    throw new HTTPException(409, { message: "This email has a pending invite" });
  if (existing) await deleteInvite(db, existing.id);
}
