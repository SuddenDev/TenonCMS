import type { Core } from "../../cms/runtime/types.ts";
import { deleteInvite } from "../../db/queries/invites/delete-invite.query.ts";
import { notFound } from "../../http/errors.ts";

/** Deletes an invite, so its link stops working. */
export async function revokeInvite(core: Core, id: string) {
  if (!(await deleteInvite(await core.db(), id))) throw notFound();
}
