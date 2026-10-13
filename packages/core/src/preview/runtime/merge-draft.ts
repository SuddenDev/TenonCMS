import { isObject } from "../../schema/condition.ts";
import type { Drafts } from "../config/types.ts";
import { draftKey } from "./store.ts";

const idOf = (v: unknown) => (isObject(v) ? v.id : v);

// A draft holds ids where the page holds populated documents. The browser cannot populate, so equal ids keep the page's value.
function sameIds(draft: unknown, current: unknown) {
  const ids = Array.isArray(draft) ? draft : [draft];
  const now = (Array.isArray(current) ? current : [current]).map(idOf);
  return (
    ids.every((id) => typeof id === "string") &&
    ids.length === now.length &&
    ids.every((id, i) => id === now[i])
  );
}

/**
 * Applies the draft of `doc` to it: draft values replace top-level keys. For a global, pass its name as `collection`.
 * A relation whose ids did not change keeps its populated value.
 * A draft with a `locale` applies only to a `doc` of that locale. A `doc` without a `locale` takes any draft.
 */
export function merge<T>(collection: string, doc: T, drafts: Drafts): T {
  if (!isObject(doc)) return doc;
  const draft = drafts[draftKey(collection, String(doc.id ?? ""))];
  if (!draft) return doc;
  if (typeof doc.locale === "string" && draft.locale !== doc.locale) return doc;
  const out: Record<string, unknown> = { ...doc };
  for (const [key, value] of Object.entries(draft))
    out[key] = sameIds(value, doc[key]) ? doc[key] : value;
  return out as T;
}
