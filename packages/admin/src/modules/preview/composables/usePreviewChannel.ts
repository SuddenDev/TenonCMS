import { onScopeDispose } from "vue";
import { schema } from "@/shared/api";

/** What the admin sends. `id` is `''` for a global. */
export type AdminMessage =
  | { type: "draft"; collection: string; id: string; data: Record<string, unknown> }
  | { type: "saved"; collection: string; id: string }
  | { type: "mode"; edit: boolean }
  | { type: "highlight"; collection: string | null; id: string | null };

/** What the preview runtime in the page sends. `id` is `''` for a global. */
export type PageMessage =
  | { type: "ready" }
  | { type: "edit"; collection: string; id: string; path: string }
  | { type: "url"; href: string }
  | { type: "documents"; documents: { collection: string; id: string }[] };

/** The base of preview URLs: the `site` option, else the admin's origin. */
export const siteUrl = () => schema.value.site ?? location.origin;

/**
 * Listens to preview pages of the site's origin for the current scope and returns `send`, which posts to every page
 * that said `ready`: the iframe and the tabs the admin opened.
 */
export function usePreviewChannel(receive: (message: PageMessage) => void) {
  const pages = new Set<MessageEventSource>();
  const origin = () => new URL(siteUrl()).origin;
  const send = (message: AdminMessage) => {
    for (const page of pages)
      if ("closed" in page && page.closed) pages.delete(page);
      else page.postMessage(message, { targetOrigin: origin() });
  };
  const onMessage = (e: MessageEvent<PageMessage>) => {
    if (e.origin !== origin() || !e.source) return;
    if (e.data?.type === "ready") pages.add(e.source);
    receive(e.data);
  };
  window.addEventListener("message", onMessage);
  onScopeDispose(() => window.removeEventListener("message", onMessage));
  return send;
}
