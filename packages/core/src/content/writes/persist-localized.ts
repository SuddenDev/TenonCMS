import { actorId } from "../../cms/runtime/operation-context.ts";
import type { WriteState } from "./write-document.ts";
import { splitLocale } from "./split-locale.ts";
import { needsStructure } from "../reads/merge-locale.ts";
import { isObject } from "../../schema/condition.ts";
import { loadLocaleRows } from "../../db/queries/locales/load-locale-rows.query.ts";
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
  const by = actorId(scope);
  const exists = source?.locales.includes(loc.locale) ?? false;
  const global = name.kind === "global";
  const locales = global ? GLOBAL_LOCALES : DOCUMENT_LOCALES;
  let owner = global ? name.name : id;
  const sharedState = owner ? await loadSharedState(db, name, owner) : undefined;
  const hasStructure = Object.keys(loc.structure).length > 0;
  const synced = hasStructure && (source ? source.syncStructure === true : loc.syncDefault);
  const { shared, localized } = splitLocale(loc.keys, data, { fields: loc.structure, synced });
  if (hasStructure && sharedState)
    await keepStructure(state, owner!, synced, sharedState.pending, shared);

  if (isDraft) {
    // A draft that leaves the shared values as they are MUST NOT create a shared draft.
    const unchanged = sharedState && sameJson(sharedState.pending, shared);

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

  if (isDraft) await saveLocaleDraft(db, locales, owner!, loc.locale, localized);
  else await saveLocale(db, locales, owner!, loc.locale, localized, isPublish);
  return owner!;
}

/**
 * Keeps the document's own `syncStructure` in the shared data. A separate document keeps the stored structure while another
 * locale row still holds values by id; the first write after that drops it.
 */
async function keepStructure(
  state: WriteState,
  owner: string,
  synced: boolean,
  stored: Data,
  shared: Data,
) {
  if (typeof stored.syncStructure === "boolean") shared.syncStructure = stored.syncStructure;
  if (synced) return;

  const loc = state.locale!;
  const kept = Object.entries(loc.structure).filter(([key]) => stored[key] != null);
  if (!kept.length) return;
  const locales = state.target.kind === "global" ? GLOBAL_LOCALES : DOCUMENT_LOCALES;
  const rows = (await loadLocaleRows(state.database, locales, owner)).filter(
    (r) => r.locale !== loc.locale,
  );
  for (const [key, field] of kept)
    if (
      rows.some((r) => needsStructure(field, r.data[key]) || needsStructure(field, r.draft?.[key]))
    )
      shared[key] = stored[key];
}

type Data = Record<string, any>;

// Compares JSON values whatever their key order.
const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const sorted = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sorted)
    : isObject(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sorted(v[k])]),
        )
      : v;
