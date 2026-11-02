import type { DocumentRef, Drafts, Unsubscribe } from "../config/types.ts";

let drafts: Drafts = {};
const listeners = new Set<(drafts: Drafts) => void>();
const reads = new Map<object, DocumentRef[]>();

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

/**
 * Registers the documents one read of the page shows, so "On this page" lists them without `edit()` bindings.
 * `owner` identifies the read. An empty list unregisters it.
 */
export function setReadDocuments(owner: object, documents: DocumentRef[]) {
  if (documents.length) reads.set(owner, documents);
  else reads.delete(owner);
}

/** The documents of every registered read, in registration order. */
export const readDocuments = () => [...reads.values()].flat();
