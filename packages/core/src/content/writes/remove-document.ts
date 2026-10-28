import { breakRichtextLinks } from "../../richtext/integrity/break-links.ts";
import type { DeleteOptions } from "../../errors.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { collectionTarget, target, targetKey } from "../targets.ts";
import { locOf } from "../reads/loc-of.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { hookArgs } from "../lifecycle/hook-args.ts";
import { slot } from "../lifecycle/collect-hooks.ts";
import { runHooks } from "../../schema/runtime/run-hooks.ts";
import { onDelete } from "../integrity/apply-on-delete.ts";
import { update } from "../../collections/operations/update.operation.ts";
import { setGlobal } from "../../globals/operations/set.operation.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import { deleteDoc } from "../../db/queries/documents/delete-document.query.ts";
import { deleteLocales } from "../../db/queries/locales/delete-locales.query.ts";
import { deleteVersions } from "../../db/queries/versions/delete-versions.query.ts";
import { DOCUMENT_LOCALES } from "../../db/queries/document-sql.ts";
import { enforce, permit } from "../../access/rule.ts";

/**
 * `delete`: the `delete` rule, the hooks around the row delete, then `onDelete` for every reference.
 * @throws {ForbiddenError} When the rule denies.
 */
export async function remove(
  core: Core,
  s: Inner,
  collection: string,
  id: string,
  options: DeleteOptions = {},
) {
  const db = await databaseForScope(core, s);
  // A denial comes first, so a caller without the right learns nothing about missing documents.
  const decision = await permit(core, s, collectionTarget(collection), "delete", { id });

  // A delete removes the row whether it was published or not.
  const loc = locOf(core, s, target(core, collectionTarget(collection)));
  const doc = await loadDoc(db, collection, id, true, loc);
  if (!doc) return;
  enforce(s, decision, doc);

  const base = hookArgs(s, collectionTarget(collection), { id, doc });
  await runHooks(slot(core, collectionTarget(collection), "beforeDelete"), "doc", doc, base);
  await breakRichtextLinks(db, core, collection, id, options.allowBrokenLinks);

  await deleteDoc(db, collection, id);
  if (core.localization) await deleteLocales(db, DOCUMENT_LOCALES, id);
  await deleteVersions(db, targetKey(collectionTarget(collection)), id);

  await onDelete(db, core.schema, collection, id, {
    update: (collection, id, data, locale) =>
      update(core, locale ? { ...s, locale } : s, collection, id, data, "deletion-effect"),
    setGlobal: (name, data, locale) =>
      setGlobal(core, locale ? { ...s, locale } : s, name, data, "deletion-effect"),
    delete: (collection, id) => s.cms.delete(collection, id, options),
  });

  await runHooks(slot(core, collectionTarget(collection), "afterDelete"), "doc", doc, base);
}
