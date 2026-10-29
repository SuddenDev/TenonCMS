import { isPreviewMessage } from "../../../../../core/src/preview/runtime/message.ts";
import type { Excluded } from "../../../../../core/src/preview/config/types.ts";
import { onScopeDispose } from "vue";
import { schema } from "@/shared/api";

/** What the admin sends. `id` is `''` for a global. `locale`: the language of a localized document. */
export type AdminMessage =
  | {
      type: "draft";
      collection: string;
      id: string;
      data: Record<string, unknown>;
      locale?: string;
    }
  | { type: "saved"; collection: string; id: string; locale?: string }
  | { type: "mode"; edit: boolean; exclude: Excluded }
  | { type: "highlight"; collection: string | null; id: string | null };

const tabs = new Set<Window>();
export const registerPreviewTab = (tab: Window | null) => {
  if (tab) tabs.add(tab);
};

/** What the preview runtime in the page sends. `id` is `''` for a global. */
export type PageMessage =
  | { type: "mode"; edit: boolean }
  | { type: "ready" }
  | { type: "edit"; collection: string; id: string; path: string }
  | { type: "url"; href: string }
  | { type: "documents"; documents: { collection: string; id: string }[] };

/** The base of preview URLs: the `site` option, else the admin's origin. */
export const siteUrl = () => schema.value.site ?? location.origin;

/**
 * The collections and globals with `visualEditing: false`, which edit mode on the page leaves alone.
 * @returns Their names, for the `mode` message.
 */
export function excluded(): Excluded {
  const off = (entries: Record<string, { visualEditing?: boolean }> = {}) =>
    Object.keys(entries).filter((name) => entries[name].visualEditing === false);
  return { collections: off(schema.value.collections), globals: off(schema.value.globals) };
}

/**
 * Listens to preview pages of the site's origin for the current scope and returns `send`, which posts to every page
 * that said `ready`: the iframe and the tabs the admin opened.
 */
export function usePreviewChannel(receive: (message: PageMessage) => void) {
  const pages = new Set<Window>();
  const origin = () => new URL(siteUrl()).origin;
  const send = (message: AdminMessage) => {
    for (const page of pages)
      if ("closed" in page && page.closed) pages.delete(page);
      else page.postMessage(message, { targetOrigin: origin() });
  };
  const onMessage = (e: MessageEvent<PageMessage>) => {
    if (e.origin !== origin() || !e.source || !isPreviewMessage(e.data)) return;
    const frame = document.querySelector<HTMLIFrameElement>(
      'iframe[name="tenon-preview"]',
    )?.contentWindow;
    if (e.source !== frame && !tabs.has(e.source as Window)) return;
    if (e.data?.type === "ready") pages.add(e.source as Window);
    if (["ready", "edit", "url", "documents", "mode"].includes(e.data.type)) receive(e.data);
  };
  window.addEventListener("message", onMessage);
  onScopeDispose(() => {
    window.removeEventListener("message", onMessage);
    pages.clear();
  });
  return send;
}
