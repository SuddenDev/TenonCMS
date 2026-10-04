import type { Drafts, Unsubscribe } from "../config/types.ts";

let drafts: Drafts = {};
const listeners = new Set<(drafts: Drafts) => void>();

/** The current drafts. A new object after every change, so it works as an external store snapshot. */
export const getDrafts = () => drafts;

/** Calls `cb` with all drafts whenever the admin pushes one. */
export function subscribe(cb: (drafts: Drafts) => void): Unsubscribe {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setDraft(collection: string, id: string, data: Record<string, unknown>) {
  drafts = { ...drafts, [`${collection}:${id}`]: data };
  for (const cb of listeners) cb(drafts);
}
