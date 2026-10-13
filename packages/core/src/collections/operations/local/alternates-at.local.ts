import type { Core, Scope } from "../../../cms/runtime/types.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import { localeFromPath } from "../../../helpers/locale-path.ts";
import { placeholders } from "../../../preview/templates/placeholders.ts";
import { filterable } from "../../../schema/traversal/filterable.ts";
import { findOneLocal } from "./find-one.local.ts";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Turns a template into a matcher and the fields its placeholders fill. Only a template of plain top-level
// fields inverts: a relation hop, `{locale}` or a function does not.
function matcher(template: unknown, fields: Parameters<typeof filterable>[0]) {
  if (typeof template !== "string") return;
  const keys = placeholders(template);
  if (!keys.length || !keys.every((k) => filterable(fields, k))) return;
  const source = template
    .split(/\{[^{}]+\}/)
    .map(escape)
    .join("(.+?)");
  return { keys, pattern: new RegExp(`^${source}$`) };
}

export const alternatesAtLocal =
  (core: Core, scope: Scope): LocalApi["alternatesAt"] =>
  async (url, options) => {
    const l = core.localization;
    if (!l) return null;
    const { locale, path } = options?.locale
      ? { locale: options.locale, path: url }
      : localeFromPath(url, l);
    const read = { locale, alternates: true, select: { alternates: true } };

    for (const [name, entry] of Object.entries(core.schema.collections)) {
      const m = entry.localized && matcher(entry.permalink, entry.fields);
      const hit = m && m.pattern.exec(path);
      if (!m || !hit) continue;

      const where = Object.fromEntries(m.keys.map((k, i) => [k, safeDecode(hit[i + 1]!)]));
      const doc = await findOneLocal(core, scope)(name, { ...read, where });
      if (doc) return doc.alternates ?? null;
    }
    return null;
  };

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
