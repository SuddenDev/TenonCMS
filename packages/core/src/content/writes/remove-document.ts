import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { col } from "../targets.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { hookArgs } from "../lifecycle/hook-args.ts";
import { slot } from "../lifecycle/collect-hooks.ts";
import { runHooks } from "../../schema/runtime/run-hooks.ts";
import { onDelete } from "../integrity/apply-on-delete.ts";
import { update } from "../../collections/operations/update.operation.ts";
import { setGlobal } from "../../globals/operations/set.operation.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import { deleteDoc } from "../../db/queries/documents/delete-document.query.ts";

/**
 * `delete`: the hooks around the row delete, then `onDelete` for every reference.
 */
export async function remove(core: Core, s: Inner, collection: string, id: string) {
  const db = await q(core, s);

  // A delete removes the row whether it was published or not.
  const doc = await loadDoc(db, collection, id, true);
  if (!doc) return;

  const base = hookArgs(s, col(collection), { id, doc });
  await runHooks(slot(core, col(collection), "beforeDelete"), "doc", doc, base);
  await deleteDoc(db, collection, id);
  await onDelete(db, core.schema, collection, id, {
    update: (collection, id, data) => update(core, s, collection, id, data, { effect: true }),
    setGlobal: (name, data) => setGlobal(core, s, name, data, { effect: true }),
    delete: (collection, id) => s.cms.delete(collection, id),
  });
  await runHooks(slot(core, col(collection), "afterDelete"), "doc", doc, base);
}
