import {
  type MaybeRefOrGetter,
  onScopeDispose,
  type ShallowRef,
  shallowRef,
  toValue,
  watch,
} from "vue";
import { getDrafts, merge, preview, subscribe } from "./index.ts";

/**
 * `doc` with the admin's unsaved changes merged in, while the page runs in the live preview. Elsewhere it is `doc`.
 * Starts the preview runtime. For a global, pass its name as `collection`.
 * @example
 * const post = useDraft('posts', data)
 */
export function useDraft<T>(collection: string, doc: MaybeRefOrGetter<T>): ShallowRef<T> {
  const drafts = shallowRef(getDrafts());
  const result = shallowRef(merge(collection, toValue(doc), drafts.value));
  // Servers render once and never dispose the scope, so only browsers subscribe.
  if (globalThis.window) {
    preview();
    onScopeDispose(subscribe((d) => (drafts.value = d)));
  }
  watch([() => toValue(doc), drafts], ([d, ds]) => (result.value = merge(collection, d, ds)));
  return result;
}
