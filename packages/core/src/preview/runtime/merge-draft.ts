import { isObject } from "../../schema/condition.ts";
import type { Drafts } from "../config/types.ts";
import { draftKey } from "./store.ts";

const idOf = (v: unknown) => (isObject(v) ? v.id : v);

// A draft MAY hold ids where the page holds populated documents. The browser cannot populate, so equal ids keep the page's value.
function sameIds(draft: unknown, current: unknown) {
  const ids = Array.isArray(draft) ? draft : [draft];
  const now = (Array.isArray(current) ? current : [current]).map(idOf);
  return (
    ids.every((id) => typeof id === "string") &&
    ids.length === now.length &&
    ids.every((id, i) => id === now[i])
  );
}

const isId = (v: unknown) => typeof v === "string";
const toId = (v: unknown) => (isObject(v) && isId(v.id) ? v.id : v);
// The page holds ids (`populate: false`) where the admin sends documents.
const holdsIds = (v: unknown) => isId(v) || (Array.isArray(v) && v.length > 0 && v.every(isId));

const isItems = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.every((item) => isObject(item) && typeof item.id === "string");

function mergeKeys(draft: Record<string, unknown>, current: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) out[key] = mergeValue(value, current[key]);
  return out;
}

// The ids check MUST come first: a populated relation is an object with `id` too.
function mergeValue(draft: unknown, current: unknown): unknown {
  if (holdsIds(current)) draft = Array.isArray(draft) ? draft.map(toId) : toId(draft);
  if (sameIds(draft, current)) return current;
  if (isItems(draft) && isItems(current)) {
    const byId = new Map(current.map((item) => [item.id, item]));
    return draft.map((item) => {
      const now = byId.get(item.id as string);
      return now ? mergeKeys(item, now) : item;
    });
  }
  if (isObject(draft) && isObject(current)) return mergeKeys(draft, current);
  return draft;
}

/**
 * Applies the draft of `doc` to it. For a global, pass its name as `collection`.
 * Draft values replace the page's, recursively: a value whose ids did not change keeps its populated value,
 * list items (objects with a string `id`) match by `id` in draft order, and objects merge per key of the draft.
 * A draft with a `locale` applies only to a `doc` of that locale. A `doc` without a `locale` takes any draft.
 */
export function merge<T>(collection: string, doc: T, drafts: Drafts): T {
  if (!isObject(doc)) return doc;
  const draft = drafts[draftKey(collection, String(doc.id ?? ""))];
  if (!draft) return doc;
  if (typeof doc.locale === "string" && draft.locale !== doc.locale) return doc;
  return { ...doc, ...mergeKeys(draft, doc) } as T;
}
