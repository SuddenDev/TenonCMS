import type { CmsUser } from "../../admin/index.d.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { renewInvite } from "../../db/queries/invites/renew-invite.query.ts";
import { notFound } from "../../http/errors.ts";
import { INVITE_TTL } from "../invite.ts";
import { inviteLink } from "../invite-url.ts";
import { hashToken, newToken } from "../token.ts";
import { sendInvite } from "./send-invite.operation.ts";

/** Gives an invite a new token and expiry, so the old link stops working, and sends it again. */
export async function resendInvite(
  core: Core,
  inviter: CmsUser,
  id: string,
  url: string,
  origin: string,
) {
  const token = newToken();
  const link = inviteLink(url, token, origin);
  const db = await core.db();
  const row = await renewInvite(db, id, await hashToken(token), Date.now() + INVITE_TTL);
  if (!row) throw notFound();
  return sendInvite(core, inviter, row, link);
}
