import { contextOf, inner } from "../../cms/runtime/operation-context.ts";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { q, transaction } from "../../cms/runtime/transaction.ts";
import { remove } from "../../content/writes/remove-document.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import type { MediaDoc } from "../../schema/index.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import { runMediaHooks } from "../runtime/run-media-hooks.ts";
import { deleteWithVariants } from "../variants/delete-variants.ts";

/**
 * `cms.media.delete()`: `beforeDelete` and the document delete with its `onDelete` rules in one transaction, then the file
 * and its variants, then `afterDelete`. A failed storage delete is logged; the delete still succeeds.
 */
export async function removeMedia(core: Core, scope: Scope, id: string) {
  const doc = (await loadDoc(await q(core, scope), "media", id)) as MediaDoc | undefined;
  if (!doc) return;
  await transaction(core, scope, async (s) => {
    await runMediaHooks(core, s, "beforeDelete", "doc", doc);
    await remove(core, s, "media", id);
  });
  await deleteWithVariants(mediaOf(core).storage, doc.key);
  const outside = inner(core, scope, scope.trx, contextOf(scope));
  await runMediaHooks(core, outside, "afterDelete", "doc", doc);
}
