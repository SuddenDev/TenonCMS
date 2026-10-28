import type { Core } from "../../cms/runtime/types.ts";
import type { CmsUser } from "../../admin/index.d.ts";
import { type ContentTarget, targetKey } from "../../content/targets.ts";
import { releaseLock } from "../../db/queries/locks/release-lock.query.ts";

/** Frees the user's edit lock on a document, or on a global without `id`. Someone else's lock stays. */
export async function unlockTarget(
  core: Core,
  user: CmsUser,
  name: ContentTarget,
  id: string | undefined,
) {
  await releaseLock(await core.db(), targetKey(name), id ?? "", user.id);
}
