import { type Core, type Inner } from "../../../cms/runtime/types.ts";
import { type Name } from "../../targets.ts";
import { hookArgs } from "../../lifecycle/hook-args.ts";
import { slot } from "../../lifecycle/collect-hooks.ts";
import { afterRead } from "../../lifecycle/run-read-hooks.ts";
import { checkRefs } from "../../integrity/check-references.ts";
import { checkUnique } from "../../integrity/check-unique.ts";
import { runHooks } from "../../../schema/runtime/run-hooks.ts";
import { runFieldHooks } from "../../../schema/runtime/run-field-hooks.ts";
import { loadGlobal } from "../../../db/queries/globals/load-global.query.ts";
import { saveGlobalDraft } from "../../../db/queries/drafts/save-global-draft.query.ts";
import { saveDraft } from "../../../db/queries/drafts/save-draft.query.ts";
import { insertDraft } from "../../../db/queries/drafts/insert-draft.query.ts";
import { saveGlobal } from "../../../db/queries/globals/save-global.query.ts";
import { updateDoc } from "../../../db/queries/documents/update-document.query.ts";
import { insertDoc } from "../../../db/queries/documents/insert-document.query.ts";
import type { Db } from "../../../db/queries/document-sql.ts";
import type { Operation, Fields } from "../write-document.ts";

/**
 * Stores a draft of a document or global setting.
 * @returns The stored draft
 */
export async function storeDraft(
  db: Db,
  core: Core,
  s: Inner,
  name: Name,
  operation: Operation,
  id: string | undefined,
  data: Record<string, any>,
) {
  let stored: Record<string, any>;
  if (name.kind === "global") {
    await saveGlobalDraft(db, name.name, data);
    stored = (await loadGlobal(db, name.name, true))!;
  } else if (id) {
    stored = await saveDraft(db, name.name, id, data);
  } else {
    stored = await insertDraft(db, name.name, data);
  }

  return (await afterRead(core, s, name, [stored], operation, true))[0];
}

/**
 * Stores a published document or global setting.
 * @returns The stored document after read hooks.
 */
export async function storeDocument(
  db: Db,
  core: Core,
  s: Inner,
  name: Name,
  operation: Operation,
  fields: Fields,
  id: string | undefined,
  effect: boolean | undefined,
  publish: boolean,
  originalDoc: Record<string, any> | undefined,
  args: ReturnType<typeof hookArgs>,
  data: Record<string, any>,
) {
  if (name.kind === "collection") await checkUnique(db, name.name, fields, data, id);
  if (!effect) await checkRefs(db, fields, data, id ? { collection: name.name, id } : undefined);

  let stored: Record<string, any>;
  if (name.kind === "global") {
    await saveGlobal(db, name.name, data, publish);
    stored = publish ? (await loadGlobal(db, name.name))! : data;
  } else if (id) stored = await updateDoc(db, name.name, id, data, publish);
  else stored = await insertDoc(db, name.name, data);

  const fieldArgs = (hookData: Record<string, unknown>) => ({ ...args, data: hookData });
  await runFieldHooks("afterChange", fields, stored, fieldArgs(stored));
  const doc = await runHooks(
    slot(core, name, "afterChange"),
    "doc",
    stored,
    hookArgs(s, name, { operation, previousDoc: originalDoc }),
  );
  return (await afterRead(core, s, name, [doc], operation))[0];
}
