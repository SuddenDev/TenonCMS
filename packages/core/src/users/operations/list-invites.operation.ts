import type { Core } from "../../cms/runtime/types.ts";
import { findInvites } from "../../db/queries/invites/find-invites.query.ts";
import { toInvite } from "../invite.ts";

/** Every invite, expired ones flagged. */
export async function listInvites(core: Core) {
  const now = Date.now();
  return (await findInvites(await core.db())).map((row) => toInvite(row, now));
}
