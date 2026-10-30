import type { Ref } from "vue";
import { createContext } from "reka-ui";

// Row heights 32 / 40 / 48 px. Only `detailed` shows the subtitle.
export type PaneLayout = "compact" | "normal" | "detailed";

export type PaneSort = { value: string; label: string };

export const [injectPaneMenuContext, providePaneMenuContext] = createContext<{
  layout: Ref<PaneLayout>;
}>("PaneMenu");

// The pane's element. Dialogs of its content MAY open inside it, so they leave the rest of the page visible.
export const [injectPaneElement, providePaneElement] =
  createContext<Ref<HTMLElement | undefined>>("Pane");
