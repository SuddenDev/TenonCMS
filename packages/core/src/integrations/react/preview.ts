import { useEffect, useMemo, useSyncExternalStore } from "react";
import { type Drafts, getDrafts, merge, preview, subscribe } from "../../preview/index.ts";

const none: Drafts = {};

/**
 * `doc` with the admin's unsaved changes merged in, while the page runs in the live preview. Elsewhere it is `doc`.
 * Starts the preview runtime. For a global, pass its name as `collection`.
 * @example
 * const post = useDraft('posts', loaderData.post)
 */
export function useDraft<T>(collection: string, doc: T): T {
  useEffect(() => void preview(), []);
  const drafts = useSyncExternalStore(subscribe, getDrafts, () => none);

  return useMemo(() => merge(collection, doc, drafts), [collection, doc, drafts]);
}
