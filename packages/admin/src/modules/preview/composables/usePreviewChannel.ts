import { onScopeDispose } from "vue";

/** What the admin sends. `id` is `''` for a global. */
export type AdminMessage =
  | { type: "draft"; collection: string; id: string; data: Record<string, unknown> }
  | { type: "mode"; edit: boolean };

/** What the preview runtime in the page sends. `id` is `''` for a global. */
export type PageMessage =
  | { type: "edit"; collection: string; id: string; path: string }
  | { type: "url"; href: string };

/** Opens the preview channel for the current scope and returns its `send`. */
export function usePreviewChannel(receive: (message: PageMessage) => void) {
  const channel = new BroadcastChannel("integral-cms:preview");
  channel.onmessage = (e: MessageEvent<PageMessage>) => receive(e.data);
  onScopeDispose(() => channel.close());
  return (message: AdminMessage) => channel.postMessage(message);
}
