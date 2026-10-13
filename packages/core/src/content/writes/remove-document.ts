import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { col, target } from "../targets.ts";
import { locOf } from "../reads/loc-of.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { hookArgs } from "../lifecycle/hook-args.ts";
import { slot } from "../lifecycle/collect-hooks.ts";
import { runHooks } from "../../schema/runtime/run-hooks.ts";
import { onDelete } from "../integrity/apply-on-delete.ts";
import { update } from "../../collections/operations/update.operation.ts";
import { setGlobal } from "../../globals/operations/set.operation.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import { deleteDoc } from "../../db/queries/documents/delete-document.query.ts";
import { deleteLocales } from "../../db/queries/locales/delete-locales.query.ts";
import { DOCUMENT_LOCALES } from "../../db/queries/document-sql.ts";

/**
 * `delete`: the hooks around the row delete, then `onDelete` for every reference.
 */
export async function remove(core: Core, s: Inner, collection: string, id: string) {
  const db = await q(core, s);

  // A delete removes the row whether it was published or not.
  const doc = await loadDoc(
    db,
    collection,
    id,
    true,
    locOf(core, s, target(core, col(collection))),
  );
  if (!doc) return;

  const base = hookArgs(s, col(collection), { id, doc });
  await runHooks(slot(core, col(collection), "beforeDelete"), "doc", doc, base);
  await deleteDoc(db, collection, id);
  if (core.localization) await deleteLocales(db, DOCUMENT_LOCALES, id);
  await onDelete(db, core.schema, collection, id, {
    update: (collection, id, data, locale) =>
      update(core, locale ? { ...s, locale } : s, collection, id, data, { effect: true }),
    setGlobal: (name, data, locale) =>
      setGlobal(core, locale ? { ...s, locale } : s, name, data, { effect: true }),
    delete: (collection, id) => s.cms.delete(collection, id),
  });
  await runHooks(slot(core, col(collection), "afterDelete"), "doc", doc, base);
}
