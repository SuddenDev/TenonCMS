import type { DeleteOptions } from "../../errors.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { type ContentTarget } from "../targets.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { afterRead } from "../lifecycle/run-read-hooks.ts";
import { remove } from "./remove-document.ts";
import { type Loc, DOCUMENT_LOCALES, GLOBAL_LOCALES } from "../../db/queries/document-sql.ts";
import { discardLocaleDrafts } from "../../db/queries/locales/discard-locale-drafts.query.ts";
import { loadLocaleDoc } from "../../db/queries/locales/load-locale-doc.query.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import { discardDraft } from "../../db/queries/drafts/discard-draft.query.ts";
import { discardGlobalDraft } from "../../db/queries/drafts/discard-global-draft.query.ts";

/**
 * Discards the drafts of a localized document or global, inside the operation's transaction.
 *
 * Without `all`, only the scope locale's draft goes, and a locale row that was never published with it. The shared
 * draft stays, because it MAY hold edits made in another locale. A never-published document without locale rows is
 * deleted. With `all`, the shared draft and every locale's draft go, never-published rows are deleted, and so is a
 * never-published document.
 *
 * @returns The published document in the scope locale, or `undefined` when the document or that locale's row is gone.
 */
export async function discardLocalized(
  core: Core,
  s: Inner,
  name: ContentTarget,
  id: string,
  loc: Loc,
  all: boolean,
  options: DeleteOptions = {},
) {
  const db = await databaseForScope(core, s);

  if (name.kind === "global") {
    await discardLocaleDrafts(db, GLOBAL_LOCALES, name.name, all ? undefined : loc.locale);
    if (all) await discardGlobalDraft(db, name.name);
    const doc = (await loadLocaleDoc(db, name, name.name, false, loc)) ?? {
      publishedAt: null,
      hasDraft: false,
    };

    return (await afterRead(core, s, name, [doc], "setGlobal"))[0];
  }

  const shared = await loadDoc(db, name.name, id, true);
  if (!shared) return undefined;

  await discardLocaleDrafts(db, DOCUMENT_LOCALES, id, all ? undefined : loc.locale);

  const rows = (await loadLocaleDoc(db, name, id, true, loc))!.locales;
  if (shared.publishedAt === null && (all || !rows.length)) {
    // Part of the discard, which the `update` rule allowed.
    await remove(core, { ...s, overrideAccess: true }, name.name, id, options);
    return undefined;
  }

  if (all) await discardDraft(db, name.name, id);

  const doc = await loadLocaleDoc(db, name, id, false, loc);
  if (!doc?.publishedAt) return undefined;
  return (await afterRead(core, s, name, [doc], "update"))[0];
}
