import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { type ContentTarget, target } from "../targets.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { ValidationError } from "../../errors.ts";
import { hookArgs } from "../lifecycle/hook-args.ts";
import { slot } from "../lifecycle/collect-hooks.ts";
import { afterRead } from "../lifecycle/run-read-hooks.ts";
import { runHooks } from "../../schema/runtime/run-hooks.ts";
import { runFieldHooks } from "../../schema/runtime/run-field-hooks.ts";
import { DOCUMENT_LOCALES, GLOBAL_LOCALES } from "../../db/queries/document-sql.ts";
import { loadLocaleDoc } from "../../db/queries/locales/load-locale-doc.query.ts";
import { deleteLocale } from "../../db/queries/locales/delete-locale.query.ts";
import { locOf } from "../reads/loc-of.ts";
import { guard } from "../../access/rule.ts";
import { requireUnscheduled } from "../../schedule/operations/require-unscheduled.ts";

/**
 * Deletes the locale row of the scope's locale, then runs `afterChange` with the document as it is afterwards.
 *
 * @returns The document in the removed locale, without its localized values, or `undefined` when the document does not exist.
 * @throws {ValidationError} For an unlocalized entry, the default locale, a locale without a version, the last locale row,
 * or a locale whose publish is scheduled.
 * @throws {ForbiddenError} When the `update` rule denies.
 */
export async function removeLocalized(
  core: Core,
  s: Inner,
  name: ContentTarget,
  id: string | undefined,
) {
  const entry = target(core, name);
  const loc = await locOf(core, { ...s, fallback: false }, name);
  if (!loc) throw new ValidationError({ "": `"${name.name}" is not localized` });
  if (loc.locale === loc.defaultLocale)
    throw new ValidationError({ locale: "The default locale cannot be removed" });

  await guard(core, s, name, "update", { id });
  const db = await databaseForScope(core, s);
  const global = name.kind === "global";
  const before = await loadLocaleDoc(db, name, id ?? "", true, loc);
  if (!before) return undefined;
  if (!before.locales.includes(loc.locale))
    throw new ValidationError({ locale: "No version in this locale" });
  if (before.locales.length === 1)
    throw new ValidationError({ locale: "The last locale cannot be removed" });
  await requireUnscheduled(db, name, id, loc.locale);

  await deleteLocale(
    db,
    global ? GLOBAL_LOCALES : DOCUMENT_LOCALES,
    global ? name.name : id!,
    loc.locale,
  );
  const stored = (await loadLocaleDoc(db, name, id ?? "", true, loc))!;

  const operation = global ? "setGlobal" : "update";
  const args = hookArgs(s, name, { operation, id, originalDoc: before });
  await runFieldHooks("afterChange", entry.fields, stored, { ...args, data: stored });
  const doc = await runHooks(
    slot(core, name, "afterChange"),
    "doc",
    stored,
    hookArgs(s, name, { operation, previousDoc: before }),
  );
  return (await afterRead(core, s, name, [doc], operation))[0];
}
