import type { WriteState } from "./write-document.ts";
import { splitLocale } from "./split-locale.ts";
import { DOCUMENT_LOCALES, GLOBAL_LOCALES } from "../../db/queries/document-sql.ts";
import { saveLocaleDraft } from "../../db/queries/locales/save-locale-draft.query.ts";
import { loadSharedState } from "../../db/queries/locales/load-shared-state.query.ts";
import { saveLocale } from "../../db/queries/locales/save-locale.query.ts";
import { saveGlobalDraft } from "../../db/queries/drafts/save-global-draft.query.ts";
import { saveDraft } from "../../db/queries/drafts/save-draft.query.ts";
import { insertDraft } from "../../db/queries/drafts/insert-draft.query.ts";
import { saveGlobal } from "../../db/queries/globals/save-global.query.ts";
import { updateDoc } from "../../db/queries/documents/update-document.query.ts";
import { insertDoc } from "../../db/queries/documents/insert-document.query.ts";

/**
 * Stores shared and locale values in the write's mode. Unchanged shared drafts are left alone.
 * Published writes MUST NOT create empty translations. Returns the document ID or global name.
 */
export async function persistLocalized(state: WriteState, data: Record<string, any>) {
  const { database: db, target: name, id, mode, source, scope } = state;
  const loc = state.locale!;
  const isDraft = mode === "draft";
  const isPublish = mode === "publish";
  const by = scope.user?.id ?? null;
  const exists = source?.locales.includes(loc.locale) ?? false;
  const { shared, localized } = splitLocale(loc.keys, data);
  const global = name.kind === "global";
  let owner = global ? name.name : id;

  if (isDraft) {
    // A draft that leaves the shared values as they are MUST NOT create a shared draft.
    const sharedState = owner ? await loadSharedState(db, name, owner) : undefined;
    const unchanged = sharedState && JSON.stringify(sharedState.pending) === JSON.stringify(shared);

    if (!unchanged) {
      if (global) await saveGlobalDraft(db, name.name, shared);
      else if (id) await saveDraft(db, name.name, id, shared, by);
      else owner = (await insertDraft(db, name.name, shared, by)).id;
    }
  } else if (global) {
    await saveGlobal(db, name.name, shared, isPublish);
  } else if (id) {
    await updateDoc(db, name.name, id, shared, isPublish, by);
  } else {
    owner = (await insertDoc(db, name.name, shared, by)).id;
  }

  if (!isDraft && !exists && Object.values(localized).every((v) => v == null)) return owner!;

  const locales = global ? GLOBAL_LOCALES : DOCUMENT_LOCALES;
  if (isDraft) await saveLocaleDraft(db, locales, owner!, loc.locale, localized);
  else await saveLocale(db, locales, owner!, loc.locale, localized, isPublish);
  return owner!;
}
