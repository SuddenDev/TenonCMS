import { checkLinkTargets } from "../../links/integrity/check-links.ts";
import { hookArgs } from "../lifecycle/hook-args.ts";
import { slot } from "../lifecycle/collect-hooks.ts";
import { afterRead } from "../lifecycle/run-read-hooks.ts";
import { checkRefs } from "../integrity/check-references.ts";
import { checkUnique } from "../integrity/check-unique.ts";
import { runHooks } from "../../schema/runtime/run-hooks.ts";
import { runFieldHooks } from "../../schema/runtime/run-field-hooks.ts";
import { loadGlobal } from "../../db/queries/globals/load-global.query.ts";
import { saveGlobalDraft } from "../../db/queries/drafts/save-global-draft.query.ts";
import { saveDraft } from "../../db/queries/drafts/save-draft.query.ts";
import { insertDraft } from "../../db/queries/drafts/insert-draft.query.ts";
import { saveGlobal } from "../../db/queries/globals/save-global.query.ts";
import { updateDoc } from "../../db/queries/documents/update-document.query.ts";
import { insertDoc } from "../../db/queries/documents/insert-document.query.ts";
import { loadLocaleDoc } from "../../db/queries/locales/load-locale-doc.query.ts";
import { recordVersion } from "../../db/queries/versions/record-version.query.ts";
import { actorId } from "../../cms/runtime/operation-context.ts";
import { target, targetKey } from "../targets.ts";
import type { WriteState } from "./write-document.ts";
import { persistLocalized } from "./persist-localized.ts";

/** Persists one prepared write, then runs the mode's after-change and read stages. */
export async function persistDocument(state: WriteState, data: Record<string, any>) {
  const {
    core,
    scope,
    database: db,
    target: name,
    operation,
    fields,
    id,
    mode,
    originalDoc,
    args,
    locale,
  } = state;
  const isDraft = mode === "draft";
  const isPublish = mode === "publish";
  const by = actorId(scope);

  if (!isDraft) {
    if (name.kind === "collection") await checkUnique(db, name.name, fields, data, id, locale);
    if (mode !== "deletion-effect") {
      await checkLinkTargets(db, core, fields, data);
      await checkRefs(db, fields, data, id ? { collection: name.name, id } : undefined);
    }
  }

  let stored: Record<string, any>;
  if (locale) {
    const owner = await persistLocalized(state, data);
    stored = (await loadLocaleDoc(db, name, owner, isDraft, locale))!;
  } else if (name.kind === "global") {
    if (isDraft) {
      await saveGlobalDraft(db, name.name, data);
      stored = (await loadGlobal(db, name.name, true))!;
    } else {
      await saveGlobal(db, name.name, data, isPublish);
      stored = (await loadGlobal(db, name.name))!;
    }
  } else if (isDraft) {
    stored = id
      ? await saveDraft(db, name.name, id, data, by)
      : await insertDraft(db, name.name, data, by);
  } else {
    stored = id
      ? await updateDoc(db, name.name, id, data, isPublish, by)
      : await insertDoc(db, name.name, data, by);
  }

  if (mode !== "deletion-effect")
    await recordVersion(db, {
      target: targetKey(name),
      docId: name.kind === "global" ? "" : stored.id,
      locale: locale?.locale ?? null,
      status: isDraft ? "draft" : "published",
      data,
      by,
      max: target(core, name).maxVersions,
    });

  if (isDraft) return (await afterRead(core, scope, name, [stored], operation, true))[0];

  await runFieldHooks("afterChange", fields, stored, { ...args, data: stored });
  const doc = await runHooks(
    slot(core, name, "afterChange"),
    "doc",
    stored,
    hookArgs(scope, name, { operation, previousDoc: originalDoc }),
  );
  return (await afterRead(core, scope, name, [doc], operation))[0];
}
