import type { Core, Inner } from "../../cms/runtime/types.ts";
import { actorId } from "../../cms/runtime/operation-context.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { ValidationError } from "../../errors.ts";
import { guard } from "../../access/rule.ts";
import { isObject } from "../../schema/condition.ts";
import type { Db, Loc } from "../../db/queries/document-sql.ts";
import { loadLocaleDoc } from "../../db/queries/locales/load-locale-doc.query.ts";
import { loadSharedState } from "../../db/queries/locales/load-shared-state.query.ts";
import { saveDraft } from "../../db/queries/drafts/save-draft.query.ts";
import { saveGlobalDraft } from "../../db/queries/drafts/save-global-draft.query.ts";
import { saveGlobal } from "../../db/queries/globals/save-global.query.ts";
import { updateDoc } from "../../db/queries/documents/update-document.query.ts";
import { recordVersion } from "../../db/queries/versions/record-version.query.ts";
import { afterRead } from "../lifecycle/run-read-hooks.ts";
import { locOf } from "../reads/loc-of.ts";
import { type ContentTarget, target, targetKey } from "../targets.ts";
import { structureOf } from "./split-locale.ts";

/** `true` or `false` sets the document's own state; `"default"` makes it follow its collection or global. */
export type SyncChoice = boolean | "default";

/** Per locale with a row: items that disappear from view, and items that show fallback values. */
export type StructureCounts = Record<string, { removed: number; added: number }>;

/** Options of a switch. `locale` names the locale whose structure a switch to on shares. Default: the default locale. */
export type SyncStructureOptions = { locale?: string; dryRun?: boolean };

/** The documents an `applySyncStructure` changes and, for a dry run, the counts per locale summed over them. */
export type AppliedStructure = { documents: number; locales: StructureCounts };

/**
 * Sets whether a document uses one structure in every locale. Turning it on makes the scope's locale's structure the shared
 * one; turning it off keeps the stored structure for rows that still hold values by id. It is one write of the shared
 * row: a draft when the entry has drafts, else saved at once.
 * @returns The counts with `dryRun`, the document in the scope's locale otherwise, or `undefined` for a missing
 * document.
 * @throws {ValidationError} For an entry without structure fields.
 * @throws {ForbiddenError} When the `update` rule denies.
 */
export async function setSyncStructure(
  core: Core,
  s: Inner,
  name: ContentTarget,
  id: string | undefined,
  sync: SyncChoice,
  dryRun = false,
) {
  await guard(core, s, name, "update", { id });
  const loc = await structureLoc(core, s, name);
  const db = await databaseForScope(core, s);
  const owner = name.kind === "global" ? name.name : id!;
  const source = await loadLocaleDoc(db, name, owner, true, loc);
  const state = await loadSharedState(db, name, owner);
  if (!source || !state) return undefined;

  const own = sync === "default" ? undefined : sync;
  const turnsOn = (own ?? loc.syncDefault) && !source.syncStructure;
  // A list the locale has none of takes the default locale's, as a read with fallback shows it.
  const base =
    loc.locale === loc.defaultLocale
      ? source
      : await loadLocaleDoc(db, name, owner, true, { ...loc, locale: loc.defaultLocale });
  const structure = Object.fromEntries(
    Object.entries(loc.structure).map(([key, f]) => [
      key,
      structureOf(f, source[key] ?? base?.[key]),
    ]),
  );
  if (dryRun)
    return turnsOn
      ? countChanges(db, name, owner, loc, structure, source.locales)
      : none(source.locales);

  const { syncStructure, ...shared } = state.pending;
  const written = {
    ...shared,
    ...(turnsOn && structure),
    ...(own !== undefined && { syncStructure: own }),
  };
  const drafts = target(core, name).drafts !== false;
  if (JSON.stringify(written) === JSON.stringify(state.pending))
    return (await afterRead(core, s, name, [source], operationOf(name), drafts))[0];

  const by = actorId(s);
  if (name.kind === "global") {
    if (drafts) await saveGlobalDraft(db, name.name, written);
    else await saveGlobal(db, name.name, written);
  } else if (drafts) await saveDraft(db, name.name, owner, written, by);
  else await updateDoc(db, name.name, owner, written, false, by);

  const doc = (await loadLocaleDoc(db, name, owner, true, loc))!;
  const { locale, locales, sharedDraft, syncStructure: _, syncStructureDefault, ...data } = doc;
  await recordVersion(db, {
    target: targetKey(name),
    docId: name.kind === "global" ? "" : owner,
    locale: loc.locale,
    status: drafts ? "draft" : "published",
    data,
    by,
    max: target(core, name).maxVersions,
  });
  return (await afterRead(core, s, name, [doc], operationOf(name), drafts))[0];
}

/**
 * Makes every document of a collection follow it, with the default locale's structure where that turns it on.
 * Checks `update` on every document before the first write.
 * @returns The number of documents and, with `dryRun`, the counts per locale summed over them.
 * @throws {ForbiddenError} When the `update` rule denies one document. Nothing is written then.
 */
export async function applySyncStructure(
  core: Core,
  s: Inner,
  collection: string,
  dryRun = false,
): Promise<AppliedStructure> {
  const name: ContentTarget = { kind: "collection", name: collection };
  const scope = { ...s, locale: core.localization?.defaultLocale };
  await structureLoc(core, scope, name);
  const db = await databaseForScope(core, s);
  const rows = await db
    .selectFrom("cms_documents")
    .select("id")
    .where("collection", "=", collection)
    .execute();
  for (const { id } of rows) await guard(core, scope, name, "update", { id });

  const locales: StructureCounts = {};
  for (const { id } of rows) {
    const counts = await setSyncStructure(core, scope, name, id, "default", dryRun);
    if (!dryRun || !counts) continue;
    for (const [locale, c] of Object.entries(counts as StructureCounts)) {
      locales[locale] ??= { removed: 0, added: 0 };
      locales[locale].removed += c.removed;
      locales[locale].added += c.added;
    }
  }
  return { documents: rows.length, locales };
}

const operationOf = (name: ContentTarget) => (name.kind === "global" ? "setGlobal" : "update");

// The locale descriptor of a switch, without fallback.
async function structureLoc(core: Core, s: Inner, name: ContentTarget) {
  const loc = await locOf(core, { ...s, fallback: false }, name);
  if (!loc || !Object.keys(loc.structure).length)
    throw new ValidationError({ "": `"${name.name}" has no structure to share` });
  return loc;
}

const none = (locales: string[]): StructureCounts =>
  Object.fromEntries(locales.map((l) => [l, { removed: 0, added: 0 }]));

// Compares what each locale shows now with the new structure. An item the locale does not show yet shows fallback values.
async function countChanges(
  db: Db,
  name: ContentTarget,
  owner: string,
  loc: Loc,
  structure: Record<string, unknown>,
  locales: string[],
) {
  const next = idsIn(structure);
  const counts: StructureCounts = {};
  for (const locale of locales) {
    const doc = await loadLocaleDoc(db, name, owner, true, { ...loc, locale });
    const shown = idsIn(Object.keys(loc.structure).map((key) => doc?.[key]));
    counts[locale] = {
      removed: [...shown].filter((id) => !next.has(id)).length,
      added: [...next].filter((id) => !shown.has(id)).length,
    };
  }
  return counts;
}

// The ids of every item in a value, at any depth.
function idsIn(value: unknown, out = new Set<string>()) {
  if (Array.isArray(value))
    for (const item of value) {
      if (isObject(item) && typeof item.id === "string") out.add(item.id);
      idsIn(item, out);
    }
  else if (isObject(value)) for (const v of Object.values(value)) idsIn(v, out);
  return out;
}
