import { Idiomorph } from "idiomorph";
import type { Unsubscribe, PreviewMessage, PreviewOptions } from "../config/types.ts";
import { startAdminBar } from "./admin-bar.ts";
import { boundDocuments, highlight, parseBinding, patch, patchAll } from "./bind-elements.ts";
import { hasSessionHint } from "./site-api.ts";
import { setDraft } from "./store.ts";

const STYLE =
  "[data-cms-edit] [data-cms]:hover{outline:2px dashed #3b82f6;outline-offset:2px;cursor:pointer}" +
  "[data-cms-highlight]{outline:2px solid #3b82f6!important;outline-offset:2px;background:rgb(59 130 246/.08)}";

let stop: Unsubscribe | undefined;

/**
 * Starts the preview runtime. The mode comes from `window.name`:
 * - `integral-preview` (the admin's iframe): live preview.
 * - `integral-preview-…` (a preview the admin opened in a tab): live preview and the admin bar with an edit switch.
 * - Anything else: the admin bar, but only with the session hint cookie and a session. Otherwise it does nothing.
 *
 * Calling it again returns the same stop function.
 */
export const preview: (options?: PreviewOptions) => Unsubscribe = ({
  morph = false,
  admin = "/admin",
} = {}) => {
  if (stop) return stop;
  const name = globalThis.window?.name;
  if (name === undefined) return () => {};

  if (name.startsWith("integral-preview")) return track(startLive(name, morph, admin));
  // The admin's own page MAY load this too (Astro injects it into every page).
  const onAdminPage = admin && (location.pathname + "/").startsWith(`${admin}/`);
  if (!admin || onAdminPage || !hasSessionHint()) return () => {};
  return track(startAdminBar("site", admin).stop);
};

// Keeps the running stop function, so a second `preview()` returns it.
const track = (cleanup: Unsubscribe) =>
  (stop = () => {
    stop = undefined;
    cleanup();
  });

// Live preview: drafts from the admin patch bound elements, and edit clicks go back to the admin.
const startLive = (name: string, morph: boolean, admin: string | false): Unsubscribe => {
  const html = document.documentElement;
  let active = true;
  const channel = openChannel(admin);
  const rerender = createRerender(() => active);
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  // The bar's switch and the admin's `mode` message both go through `setEditMode()`; the last one wins.
  const setEditMode = (edit: boolean) => {
    html.toggleAttribute("data-cms-edit", edit);
    bar?.setEdit(edit);
  };
  const bar = name.startsWith("integral-preview-")
    ? startAdminBar("preview-tab", admin || "", setEditMode)
    : undefined;

  const onMessage = (event: MessageEvent<PreviewMessage>) => {
    if (!channel.accept(event)) return;
    const message = event.data;
    if (message.type === "draft") {
      setDraft(message.collection, message.id, message.data);
      patchAll(document);
    } else if (message.type === "mode") {
      setEditMode(message.edit);
    } else if (message.type === "highlight") {
      highlight(message.collection, message.id);
    } else if (message.type === "saved" && morph) {
      void rerender();
    }
  };

  // Framework re-renders replace bound elements or their text with the saved values.
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      const target = r.target instanceof Element ? r.target : r.target.parentElement;
      const bound = target?.closest("[data-cms]");
      if (bound) patch(bound);
      for (const node of r.addedNodes) if (node instanceof Element) patchAll(node);
    }
    channel.report();
    bar?.refresh();
  });

  const onClick = (e: MouseEvent) => {
    if (!html.hasAttribute("data-cms-edit") || !(e.target instanceof Element)) return;
    const bound = e.target.closest("[data-cms]");
    if (!bound) return;
    e.preventDefault();
    e.stopPropagation();
    channel.post({ type: "edit", ...parseBinding(bound.getAttribute("data-cms")!) });
  };

  observer.observe(html, { childList: true, subtree: true, characterData: true });
  document.addEventListener("click", onClick, true);
  window.addEventListener("message", onMessage);
  channel.announce();

  return () => {
    active = false;
    window.removeEventListener("message", onMessage);
    observer.disconnect();
    style.remove();
    html.removeAttribute("data-cms-edit");
    highlight(null, null);
    document.removeEventListener("click", onClick, true);
    bar?.stop();
  };
};

// The admin is the page that holds the iframe or opened the tab. Only its origin is trusted, and nothing goes out
// before its first message, so a page that frames the site learns nothing.
const openChannel = (admin: string | false) => {
  const host: Window | null = window.parent !== window ? window.parent : window.opener;
  const origin = new URL(admin || "/", location.href).origin;
  let connected = false;
  let reported = "";

  const post = (message: PreviewMessage) => connected && host?.postMessage(message, origin);

  // Tells the admin which documents the page shows, whenever that changes.
  const report = () => {
    const documents = boundDocuments();
    const key = JSON.stringify(documents);
    if (!connected || key === reported) return;
    reported = key;
    post({ type: "documents", documents });
  };

  // Whether a message comes from the admin. The first one connects the channel.
  const accept = ({ source, origin: from }: MessageEvent) => {
    if (!host || source !== host || from !== origin) return false;
    if (!connected) {
      connected = true;
      post({ type: "url", href: location.href });
      report();
    }
    return true;
  };

  // `ready` goes to `"*"`: the page does not know the admin's window yet.
  const announce = () => host?.postMessage({ type: "ready" } satisfies PreviewMessage, "*");

  return { post, report, accept, announce };
};

// Fetches the page again and morphs `<body>` into it. One fetch at a time; a save during a fetch queues one more.
const createRerender = (isActive: () => boolean) => {
  let busy = false;
  let again = false;
  return async () => {
    if (busy) return void (again = true);
    busy = true;
    do {
      again = false;
      try {
        const res = await fetch(location.href, {
          credentials: "same-origin",
          headers: { accept: "text/html" },
        });
        if (!res.ok || !isActive()) continue;
        const next = new DOMParser().parseFromString(await res.text(), "text/html");
        Idiomorph.morph(document.body, next.body);
        document.title = next.title;
        patchAll(document);
      } catch {}
    } while (again && isActive());
    busy = false;
  };
};
