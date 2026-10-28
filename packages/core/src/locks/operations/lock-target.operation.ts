import type { Core } from "../../cms/runtime/types.ts";
import type { CmsUser } from "../../admin/index.d.ts";
import { inner, outerScope } from "../../cms/runtime/operation-context.ts";
import { guard } from "../../access/rule.ts";
import { LOCK_TTL } from "../../client/constants.ts";
import { type ContentTarget, targetKey } from "../../content/targets.ts";
import { claimLock } from "../../db/queries/locks/claim-lock.query.ts";
import type { Lock } from "../types.ts";

/**
 * Claims or renews the user's edit lock on a document, or on a global without `id`. A lock someone else holds stays
 * theirs until it expires or `takeover` is set.
 * @throws {ForbiddenError} When the user MAY NOT update the target.
 */
export async function lockTarget(
  core: Core,
  user: CmsUser,
  name: ContentTarget,
  id: string | undefined,
  takeover: boolean,
): Promise<Lock> {
  await guard(core, inner(core, outerScope({ user }), undefined, {}), name, "update", { id });

  const holder = await claimLock(await core.db(), {
    target: targetKey(name),
    id: id ?? "",
    userId: user.id,
    takeover,
    expiredBefore: Date.now() - LOCK_TTL,
  });
  return { mine: holder.id === user.id, user: holder };
}
