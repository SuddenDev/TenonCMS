import type { DeleteOptions } from "../../errors.ts";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { afterCommit, transaction } from "../../cms/runtime/transaction.ts";
import { remove } from "../../content/writes/remove-document.ts";
import { reserveDeletedKey } from "../library/names-in.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import { loadMedia } from "../runtime/read-media.ts";
import { runMediaHooks } from "../runtime/run-media-hooks.ts";
import { deleteWithVariants } from "../variants/delete-variants.ts";

/**
 * `cms.media.delete()`: `beforeDelete` and the document delete with its `onDelete` rules in one transaction, then the file
 * and its variants, then `afterDelete`. A failed storage delete is logged; the delete still succeeds.
 */
export async function removeMedia(
  core: Core,
  scope: Scope,
  id: string,
  options: DeleteOptions = {},
) {
  const doc = await loadMedia(core, scope, id);
  if (!doc) return;

  await transaction(core, scope, async (s) => {
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
