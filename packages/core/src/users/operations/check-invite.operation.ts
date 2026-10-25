import type { Core } from "../../cms/runtime/types.ts";
import { inviteByToken } from "../../db/queries/invites/invite-by-token.query.ts";
import { notFound } from "../../http/errors.ts";
import { hashToken } from "../token.ts";

/** The email, role and role label of a valid, unexpired invite token. The label is for the invite page, which has no `/schema`. */
export async function checkInvite(core: Core, token: string) {
  const row = await inviteByToken(await core.db(), await hashToken(token), Date.now());
  if (!row) throw notFound();
  const label = core.roles.find((r) => r.name === row.role)?.label ?? row.role;
  return { email: row.email, role: row.role, label };
}
