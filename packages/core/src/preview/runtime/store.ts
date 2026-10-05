import type { Drafts, Unsubscribe } from "../config/types.ts";

let drafts: Drafts = {};
const listeners = new Set<(drafts: Drafts) => void>();

/** The key of a document in `Drafts`. A global has an empty `id`. */
export const draftKey = (collection: string, id: string) => `${collection}:${id}`;

/** The current drafts. A new object after every change, so it works as an external store snapshot. */
export const getDrafts = () => drafts;

/** Calls `cb` with all drafts whenever the admin pushes one. */
export function subscribe(cb: (drafts: Drafts) => void): Unsubscribe {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Stores the form state of one document and notifies every subscriber. */
export function setDraft(collection: string, id: string, data: Record<string, unknown>) {
  drafts = { ...drafts, [draftKey(collection, id)]: data };
  for (const cb of listeners) cb(drafts);
}
