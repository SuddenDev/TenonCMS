import { checkRichtextReferences } from "../../../richtext/integrity/check-references.ts";
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
import { loadLocaleDoc } from "../../../db/queries/locales/load-locale-doc.query.ts";
import type { Db } from "../../../db/queries/document-sql.ts";
import type { Operation, Fields } from "../write-document.ts";
import { saveLocalized, type LocalePlace } from "./store-locale.ts";

// The author of a write: the scope's user, `null` for server code.
const by = (s: Inner) => s.user?.id ?? null;

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
  place?: LocalePlace,
) {
  let stored: Record<string, any>;
  if (place) {
    const mode = { draft: true, publish: false, by: by(s) };
    const owner = await saveLocalized(db, name, id, data, place, mode);
    stored = (await loadLocaleDoc(db, name, owner, true, place.loc))!;
  } else if (name.kind === "global") {
    await saveGlobalDraft(db, name.name, data);
    stored = (await loadGlobal(db, name.name, true))!;
  } else if (id) {
    stored = await saveDraft(db, name.name, id, data, by(s));
  } else {
    stored = await insertDraft(db, name.name, data, by(s));
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
  place?: LocalePlace,
) {
  if (name.kind === "collection") await checkUnique(db, name.name, fields, data, id, place?.loc);
  if (!effect) await checkRichtextReferences(db, core, fields, data);
  if (!effect) await checkRefs(db, fields, data, id ? { collection: name.name, id } : undefined);

  let stored: Record<string, any>;
  if (place) {
    const mode = { draft: false, publish, by: by(s) };
    const owner = await saveLocalized(db, name, id, data, place, mode);
    stored = (await loadLocaleDoc(db, name, owner, false, place.loc))!;
  } else if (name.kind === "global") {
    await saveGlobal(db, name.name, data, publish);
    stored = publish ? (await loadGlobal(db, name.name))! : data;
  } else if (id) stored = await updateDoc(db, name.name, id, data, publish, by(s));
  else stored = await insertDoc(db, name.name, data, by(s));

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
