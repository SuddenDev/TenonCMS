import { Idiomorph } from "idiomorph";
import type { Unsubscribe, PreviewMessage, PreviewOptions } from "../config/types.ts";
import { bar } from "./bars.ts";
import { boundDocuments, parse, patch, patchAll } from "./bind-elements.ts";
import { setDraft } from "./store.ts";

const API = "/api/cms";
let stop: Unsubscribe | undefined;

const STYLE =
  "[data-cms-edit] [data-cms]:hover{outline:2px dashed #3b82f6;outline-offset:2px;cursor:pointer}" +
  "[data-cms-highlight]{outline:2px solid #3b82f6!important;outline-offset:2px;background:rgb(59 130 246/.08)}";

// A signed-in user on the site with the preview cookie gets the admin bar. Without a session there is no bar.
function adminBar(admin: string): Unsubscribe {
  let remove: (() => void) | undefined;
  let stopped = false;
  void fetch(`${API}/auth/get-session`, { credentials: "same-origin" })
    .then((res) => (res.ok ? res.json() : null))
    .then((session) => {
      if (session && !stopped) remove = bar("admin", admin);
    })
    .catch(() => {});
  stop = () => {
    stop = undefined;
    stopped = true;
    remove?.();
  };
  return stop;
}

/**
 * Starts the preview runtime. The mode comes from `window.name`:
 * - `integral-preview` (the admin's iframe): live preview.
 * - `integral-preview-…` (a preview the admin opened in a tab): live preview and the preview bar.
 * - Anything else: the admin bar, but only with the preview cookie and a session. Otherwise it does nothing.
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
  if (!name.startsWith("integral-preview")) {
    // The admin's own page MAY load this too (Astro injects it into every page).
    const inAdmin = admin && (location.pathname + "/").startsWith(`${admin}/`);
    if (!admin || inAdmin || !/(^|;\s*)integral-preview=[^;]/.test(document.cookie))
      return () => {};
    return adminBar(admin);
  }
  const html = document.documentElement;
  // The admin: the page that holds the iframe, or the one that opened the tab.
  const host: Window | null = window.parent !== window ? window.parent : window.opener;
  // Only the admin's origin is trusted. `admin` MAY be a full URL when the admin runs on another origin.
  const origin = new URL(admin || "/", location.href).origin;
  // Nothing goes out before the admin's first message, so a page that frames the site learns nothing.
  let connected = false;
  const post = (message: PreviewMessage) => connected && host?.postMessage(message, origin);
  // Tells the admin which documents the page shows, whenever that changes.
  let reported = "";
  const report = () => {
    const documents = boundDocuments();
    const key = JSON.stringify(documents);
    if (!connected || key === reported) return;
    reported = key;
    post({ type: "documents", documents });
  };
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  // One fetch at a time. A save during a fetch schedules one more.
  let busy = false;
  let again = false;
  const rerender = async () => {
    if (busy) return void (again = true);
    busy = true;
    do {
      again = false;
      try {
        const res = await fetch(location.href, {
          credentials: "same-origin",
          headers: { accept: "text/html" },
        });
        if (!res.ok || !stop) continue;
        const next = new DOMParser().parseFromString(await res.text(), "text/html");
        Idiomorph.morph(document.body, next.body);
        document.title = next.title;
        patchAll(document);
      } catch {}
    } while (again && stop);
    busy = false;
  };

  const onMessage = ({ source, origin: from, data }: MessageEvent<PreviewMessage>) => {
    if (!host || source !== host || from !== origin) return;
    if (!connected) {
      connected = true;
      post({ type: "url", href: location.href });
      report();
    }
    if (data.type === "draft") {
      setDraft(data.collection, data.id, data.data);
      patchAll(document);
    } else if (data.type === "mode") {
      html.toggleAttribute("data-cms-edit", data.edit);
      const input = document.querySelector<HTMLInputElement>("[data-cms-bar] input");
      if (input) input.checked = data.edit;
    } else if (data.type === "highlight") {
      for (const el of document.querySelectorAll("[data-cms-highlight]"))
        el.removeAttribute("data-cms-highlight");
      if (data.collection === null) return;
      for (const el of document.querySelectorAll("[data-cms]")) {
        const bound = parse(el.getAttribute("data-cms")!);
        if (bound.collection === data.collection && bound.id === data.id)
          el.setAttribute("data-cms-highlight", "");
      }
    } else if (data.type === "saved" && morph) {
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
    report();
  });
  observer.observe(html, { childList: true, subtree: true, characterData: true });

  const onClick = (e: MouseEvent) => {
    if (!html.hasAttribute("data-cms-edit") || !(e.target instanceof Element)) return;
    const bound = e.target.closest("[data-cms]");
    if (!bound) return;
    e.preventDefault();
    e.stopPropagation();
    post({ type: "edit", ...parse(bound.getAttribute("data-cms")!) });
  };
  document.addEventListener("click", onClick, true);
  window.addEventListener("message", onMessage);
  host?.postMessage({ type: "ready" } satisfies PreviewMessage, "*");
  const removeBar = name.startsWith("integral-preview-") ? bar("preview", admin || "") : undefined;

  stop = () => {
    stop = undefined;
    window.removeEventListener("message", onMessage);
    observer.disconnect();
    style.remove();
    html.removeAttribute("data-cms-edit");
    for (const el of document.querySelectorAll("[data-cms-highlight]"))
      el.removeAttribute("data-cms-highlight");
    document.removeEventListener("click", onClick, true);
    removeBar?.();
  };
  return stop;
};
