import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { type Name, target } from "../targets.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { ValidationError } from "../../errors.ts";
import { loadLocaleDoc } from "../../db/queries/locales/load-locale-doc.query.ts";
import { locOf } from "../reads/loc-of.ts";
import { write } from "./write-document.ts";
import { guard } from "../../access/rule.ts";

/**
 * Fills the localized fields of the scope's locale (`to`) with those of `from`. `from` is read in the drafts
 * perspective without fallback. The result replaces the pending draft of `to` (with `drafts: false`, its data) through
 * the normal write pipeline.
 *
 * @returns The written document in `to`, or `undefined` when the document does not exist.
 * @throws {ValidationError} For an unlocalized entry, an unknown or equal locale, or a `from` without a version.
 * @throws {ForbiddenError} When the `update` rule denies.
 */
export async function copyLocalized(
  core: Core,
  s: Inner,
  name: Name,
  id: string | undefined,
  from: string,
) {
  await guard(core, s, name, "update", { id });
  const entry = target(core, name);
  const to = s.locale;
  const loc = locOf(core, { ...s, fallback: false }, entry);
  if (!loc || !to) throw new ValidationError({ "": `"${name.name}" is not localized` });
  if (!loc.locales.includes(from)) throw new ValidationError({ from: "Unknown locale" });
  if (from === to) throw new ValidationError({ from: "Source and target locale are equal" });

  const source = await loadLocaleDoc(await q(core, s), name, id ?? "", true, {
    ...loc,
    locale: from,
  });
  if (!source) return undefined;
  if (!source.locales.includes(from)) throw new ValidationError({ from: "No version to copy" });

  const input = Object.fromEntries(loc.keys.map((key) => [key, source[key] ?? null]));
  const draft = entry.drafts !== false;
  return name.kind === "global"
    ? write(core, s, name, "setGlobal", input, { draft })
    : write(core, s, name, "update", input, { id, draft });
}
