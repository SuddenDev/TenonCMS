import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { type Name, target } from "../targets.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { hookArgs } from "../lifecycle/hook-args.ts";
import { slot } from "../lifecycle/collect-hooks.ts";
import { afterRead } from "../reads/run-read-hooks.ts";
import { checkRefs } from "../integrity/check-references.ts";
import { checkUnique } from "../integrity/check-unique.ts";
import { runHooks } from "../../schema/runtime/run-hooks.ts";
import { isObject } from "../../schema/condition.ts";
import { parseData } from "../../schema/validation/parse-data.ts";
import { applyDefaults } from "../../schema/runtime/apply-defaults.ts";
import { fieldHooks } from "../../schema/runtime/run-field-hooks.ts";
import { fillSlugs } from "../../schema/runtime/fill-slugs.ts";
import { runValidate } from "../../schema/runtime/validate-fields.ts";
import { ValidationError } from "../../errors.ts";
import { loadGlobal } from "../../db/queries/globals/load-global.query.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import { saveGlobalDraft } from "../../db/queries/drafts/save-global-draft.query.ts";
import { saveDraft } from "../../db/queries/drafts/save-draft.query.ts";
import { insertDraft } from "../../db/queries/drafts/insert-draft.query.ts";
import { saveGlobal } from "../../db/queries/globals/save-global.query.ts";
import { updateDoc } from "../../db/queries/documents/update-document.query.ts";
import { insertDoc } from "../../db/queries/documents/insert-document.query.ts";

// The stored data of a document, without its meta.
const stripMeta = ({
  id,
  createdAt,
  updatedAt,
  publishedAt,
  hasDraft,
  ...data
}: Record<string, unknown>) => data;

export type WriteFlags = {
  /** An `onDelete` effect. It skips id checks, because other relations of the document MAY point to documents that the same delete removes. */
  effect?: boolean;
  /** A draft save. See `write()`. */
  draft?: boolean;
};
/**
 * Shared by `create`, `update`, `setGlobal` and publish. Returns `undefined` for a missing document.
 * A draft save runs defaults, slugs, `beforeValidate`, a type check and `beforeChange`, then stores the draft.
 * It skips `validate`, `unique`, id checks and `afterChange`. A publish runs on the document with its draft.
 */
export async function write(
  core: Core,
  s: Inner,
  name: Name,
  operation: "create" | "update" | "setGlobal",
  input: unknown,
  {
    id,
    effect,
    draft = false,
    publish = false,
  }: WriteFlags & { id?: string; publish?: boolean } = {},
) {
  const { fields } = target(core, name);
  const db = await q(core, s);
  const load = (drafts: boolean) =>
    name.kind === "global"
      ? loadGlobal(db, name.name, drafts)
      : id
        ? loadDoc(db, name.name, id, drafts)
        : undefined;
  // Draft saves and publishes merge over the draft. A plain write MUST merge over the published data, also in a drafts scope.
  const source = await load(draft || publish);
  if (id && !source) return undefined;
  // Hooks of a publish compare with the published document, which is `undefined` on a first publish.
  const originalDoc = publish ? await load(false) : source;
  const args = hookArgs(s, name, { operation, id, originalDoc, draft });
  const fieldArgs = (data: Record<string, unknown>) => ({ ...args, data });

  // `update` and `setGlobal` change only the top-level keys they get. The others keep their stored values.
  const copy =
    source && isObject(input)
      ? { ...stripMeta(source), ...structuredClone(input) }
      : structuredClone(input);
  if (isObject(copy)) {
    if (operation === "create") await applyDefaults(fields, copy, args);
    await fillSlugs(fields, copy);
    await fieldHooks("beforeValidate", fields, copy, fieldArgs(copy));
  }
  const valid = parseData(
    fields,
    await runHooks(slot(core, name, "beforeValidate"), "data", copy, args),
    draft,
  );

  // `onDelete` effects only clear references, so the document's own rules do not apply.
  if (!effect && !draft) {
    const errors = await runValidate(fields, valid, fieldArgs(valid));
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }
  await fieldHooks("beforeChange", fields, valid, fieldArgs(valid));
  // Validated again, so a hook cannot store invalid data.
  const data = parseData(
    fields,
    await runHooks(slot(core, name, "beforeChange"), "data", valid, args),
    draft,
  );

  if (draft) {
    let stored: Record<string, any>;
    if (name.kind === "global") {
      await saveGlobalDraft(db, name.name, data);
      stored = (await loadGlobal(db, name.name, true))!;
    } else if (id) stored = await saveDraft(db, name.name, id, data);
    else stored = await insertDraft(db, name.name, data);
    return (await afterRead(core, s, name, [stored], operation, true))[0];
  }

  if (name.kind === "collection") await checkUnique(db, name.name, fields, data, id);
  if (!effect) await checkRefs(db, fields, data, id ? { collection: name.name, id } : undefined);

  let stored: Record<string, any>;
  if (name.kind === "global") {
    await saveGlobal(db, name.name, data, publish);
    stored = publish ? (await loadGlobal(db, name.name))! : data;
  } else if (id) stored = await updateDoc(db, name.name, id, data, publish);
  else stored = await insertDoc(db, name.name, data);

  await fieldHooks("afterChange", fields, stored, fieldArgs(stored));
  const doc = await runHooks(
    slot(core, name, "afterChange"),
    "doc",
    stored,
    hookArgs(s, name, { operation, previousDoc: originalDoc }),
  );
  return (await afterRead(core, s, name, [doc], operation))[0];
}
