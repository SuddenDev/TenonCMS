import { HTTPException } from "hono/http-exception";
import type { CmsUser } from "../../admin/index.d.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Db } from "../../db/types.ts";
import { deleteInvite } from "../../db/queries/invites/delete-invite.query.ts";
import { insertInvite } from "../../db/queries/invites/insert-invite.query.ts";
import { inviteByEmail } from "../../db/queries/invites/invite-by-email.query.ts";
import { userExists } from "../../db/queries/users/user-exists.query.ts";
import { ValidationError } from "../../errors.ts";
import { emailInput } from "../email.ts";
import { validateInput } from "../../schema/validation/validate-input.ts";
import { INVITE_TTL } from "../invite.ts";
import { inviteLink } from "../invite-url.ts";
import { hashToken, newToken } from "../token.ts";
import { sendInvite } from "./send-invite.operation.ts";

/** `invited_by` of an invite from server code or the CLI, which has no user. */
const SERVER_INVITER = "cli";

/**
 * Invites `email` with `role` and sends the invite. An expired invite for the email is replaced.
 * @param inviter The signed-in user, or `undefined` for server code.
 * @param data `url` is the invite page. Without it, the page is `<origin><admin.path>/invite`.
 * @param origin The origin the invite page MUST be on.
 * @throws {ValidationError} For an invalid email, an unknown role, a page on another origin, or no `url` with `admin: false`.
 * @throws {HTTPException} 409 when a user or a pending invite has the email.
 */
export async function createInvite(
  core: Core,
  inviter: CmsUser | undefined,
  data: { email: string; role: string; url?: string },
  origin: string,
) {
  validateInput(emailInput, data);
  if (!core.roles.some((r) => r.name === data.role))
    throw new ValidationError({ role: "Unknown role" });
  const token = newToken();
  const link = inviteLink(data.url ?? invitePage(core, origin), token, origin);
  const email = data.email.toLowerCase();
  const db = await core.db();
  const now = Date.now();

  await assertFree(db, email, now);

  const row = {
    id: crypto.randomUUID(),
    email,
    role: data.role,
    token_hash: await hashToken(token),
    invited_by: inviter?.id ?? SERVER_INVITER,
    expires_at: now + INVITE_TTL,
    created_at: now,
  };
  await insertInvite(db, row);
  return sendInvite(core, inviter, row, link);
}

function invitePage(core: Core, origin: string) {
  if (!core.admin)
    throw new ValidationError({ url: "Required, because there is no admin (`admin: false`)" });
  return `${origin}${core.admin.path}/invite`;
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
