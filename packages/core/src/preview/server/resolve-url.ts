import { isObject } from "../../schema/condition.ts";
import type { Collection, Fields, Global, LocalApi } from "../../schema/index.ts";
import { fieldAt } from "../../schema/traversal/field-at.ts";
import { placeholders } from "../templates/placeholders.ts";
import { resolve } from "../templates/resolve-template.ts";

/**
 * The preview URL of a document or global from its unsaved form state, or `null` for no preview.
 * A template reads one relation hop through `cms.findById`; a function gets `{ cms }`.
 */
export async function previewUrl(
  entry: Collection | Global,
  data: unknown,
  cms: LocalApi,
): Promise<string | null> {
  const doc = isObject(data) ? structuredClone(data) : {};
  const { preview } = entry;
  if (typeof preview === "function") return (await preview(doc, { cms })) ?? null;
  if (!preview) return null;
  for (const path of placeholders(preview)) await hop(entry.fields, doc, path, cms);
  return resolve(preview, doc);
}

// Replaces the id of the first relation on `path` with its document, in place.
async function hop(fields: Fields, doc: Record<string, unknown>, path: string, cms: LocalApi) {
  const keys = path.split(".");
  let holder: unknown = doc;
  for (let i = 0; i < keys.length - 1 && isObject(holder); i++) {
    const f = fieldAt(fields, keys.slice(0, i + 1).join("."));
    const value = holder[keys[i]!];
    if (f?.type !== "relation") {
      holder = value;
      continue;
    }
    if (typeof value === "string")
      holder[keys[i]!] = (await cms.findById(f.collection, value, { populate: false })) ?? null;
    return;
  }
}
