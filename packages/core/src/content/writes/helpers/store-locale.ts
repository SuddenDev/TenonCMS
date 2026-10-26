import type { Name } from "../../targets.ts";
import { splitLocale } from "../split-locale.ts";
import {
  DOCUMENT_LOCALES,
  GLOBAL_LOCALES,
  type Db,
  type Loc,
} from "../../../db/queries/document-sql.ts";
import { saveLocaleDraft } from "../../../db/queries/locales/save-locale-draft.query.ts";
import { loadSharedState } from "../../../db/queries/locales/load-shared-state.query.ts";
import { saveLocale } from "../../../db/queries/locales/save-locale.query.ts";
import { saveGlobalDraft } from "../../../db/queries/drafts/save-global-draft.query.ts";
import { saveDraft } from "../../../db/queries/drafts/save-draft.query.ts";
import { insertDraft } from "../../../db/queries/drafts/insert-draft.query.ts";
import { saveGlobal } from "../../../db/queries/globals/save-global.query.ts";
import { updateDoc } from "../../../db/queries/documents/update-document.query.ts";
import { insertDoc } from "../../../db/queries/documents/insert-document.query.ts";

/** The locale a write targets: its descriptor, and whether the document or global already has a row in it. */
export type LocalePlace = { loc: Loc; exists: boolean };

/**
 * Saves written data of a localized entry: shared keys to the document or global row, localized keys to the row
 * of the scope's locale. `draft` stores both as drafts, the shared one only when its values change; `publish` also clears them.
 * A published write never creates a row for a locale without values, so a write to shared fields leaves other locales alone.
 * `mode.by` is the author, `null` for server code.
 * @returns The id of the document, or the name of the global.
 */
export async function saveLocalized(
  db: Db,
  name: Name,
  id: string | undefined,
  data: Record<string, any>,
  { loc, exists }: LocalePlace,
  mode: { draft: boolean; publish: boolean; by: string | null },
) {
  const { shared, localized } = splitLocale(loc.keys, data);
  const global = name.kind === "global";
  let owner = global ? name.name : id;

  if (mode.draft) {
    // A draft that leaves the shared values as they are MUST NOT create a shared draft.
    const state = owner ? await loadSharedState(db, name, owner) : undefined;
    const unchanged = state && JSON.stringify(state.pending) === JSON.stringify(shared);
    if (!unchanged) {
      if (global) await saveGlobalDraft(db, name.name, shared);
      else if (id) await saveDraft(db, name.name, id, shared, mode.by);
      else owner = (await insertDraft(db, name.name, shared, mode.by)).id;
    }
  } else if (global) await saveGlobal(db, name.name, shared, mode.publish);
  else if (id) await updateDoc(db, name.name, id, shared, mode.publish, mode.by);
  else owner = (await insertDoc(db, name.name, shared, mode.by)).id;

  if (!mode.draft && !exists && Object.values(localized).every((v) => v == null)) return owner!;

  const locales = global ? GLOBAL_LOCALES : DOCUMENT_LOCALES;
  if (mode.draft) await saveLocaleDraft(db, locales, owner!, loc.locale, localized);
  else await saveLocale(db, locales, owner!, loc.locale, localized, mode.publish);
  return owner!;
}
