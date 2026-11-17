import type { DeleteOptions } from "../../errors.ts";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { afterCommit, transaction } from "../../cms/runtime/transaction.ts";
import { guard } from "../../access/rule.ts";
import { collectionTarget } from "../../content/targets.ts";
import { remove } from "../../content/writes/remove-document.ts";
import { reserveDeletedKey } from "../library/names-in.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import { loadMedia } from "../runtime/read-media.ts";
import { runMediaHooks } from "../runtime/run-media-hooks.ts";
import { deleteWithVariants } from "../variants/delete-variants.ts";

/**
 * `cms.media.delete()`: `beforeDelete` and the document delete with its `onDelete` rules in one transaction, then the file
 * and its variants, then `afterDelete`. The `delete` rule runs before the document is loaded.
 * A failed storage delete is logged; the delete still succeeds.
 * @throws {ForbiddenError} When `media.access.delete` denies, for a missing document too.
 */
export async function removeMedia(
  core: Core,
  scope: Scope,
  id: string,
  options: DeleteOptions = {},
) {
  await transaction(core, scope, async (s) => {
    await guard(core, s, collectionTarget("media"), "delete", { id });
    const doc = await loadMedia(core, s, id);
    if (!doc) return;

    await runMediaHooks(core, s, "beforeDelete", "doc", doc);
    const releaseKey = reserveDeletedKey(core, s, doc);
    await remove(core, s, "media", id, options);
    afterCommit(s, async (outside) => {
      try {
        await deleteWithVariants(mediaOf(core).storage, doc.key);
      } finally {
        releaseKey();
      }
      await runMediaHooks(core, outside, "afterDelete", "doc", doc);
    });
  });
}
