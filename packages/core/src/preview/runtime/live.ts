import { Idiomorph } from "idiomorph";
import type { PreviewMessage, Unsubscribe } from "../config/types.ts";
import { isPreviewMessage } from "./message.ts";
import { startAdminBar } from "./admin-bar.ts";
import {
  excludedSelector,
  highlight,
  parseBinding,
  patch,
  pageDocuments,
  patchAll,
  pickBound,
} from "./bind-elements.ts";
import { setDraft } from "./store.ts";

const STYLE =
  "[data-cms-edit] [data-cms]:hover{outline:2px dashed #3b82f6;outline-offset:2px;cursor:pointer}" +
  "[data-cms-highlight]{outline:2px solid #3b82f6!important;outline-offset:2px;background:rgb(59 130 246/.08)}";

// The elements of excluded entries get no outline. A click on one goes to the bound element around it.
const editStyle = (excluded: string | null) =>
  STYLE + (excluded ? `[data-cms-edit] :is(${excluded}):hover{outline:none;cursor:inherit}` : "");

// Live preview: drafts from the admin patch bound elements, and edit clicks go back to the admin.
export const startLive = (name: string, morph: boolean, admin: string | false): Unsubscribe => {
  const html = document.documentElement;
  let active = true;
  const channel = openChannel(admin);
  const rerender = createRerender(() => active);
  let excluded: string | null = null;
  const style = document.createElement("style");
  style.textContent = editStyle(excluded);
  document.head.append(style);

  // The bar's switch and the admin's `mode` message both go through `setEditMode()`; the last one wins.
  const setEditMode = (edit: boolean) => {
    if (!active) return;
    html.toggleAttribute("data-cms-edit", edit);
    if (!edit) highlight(null, null);
    bar?.setEdit(edit);
    channel.post({ type: "mode", edit });
  };
  const bar = name.startsWith("tenon-preview-")
    ? startAdminBar("preview-tab", admin || "", setEditMode, {
        onSessionEnd: () => cleanup(),
        onExit: () => {
          window.name = "";
          cleanupLive();
        },
      })
    : undefined;

  const onMessage = (event: MessageEvent<PreviewMessage>) => {
    if (!isPreviewMessage(event.data) || !channel.accept(event)) return;
    const message = event.data;
    if (message.type === "ready") {
      channel.post({ type: "mode", edit: html.hasAttribute("data-cms-edit") });
    } else if (message.type === "draft") {
      const { collection, id, data, locale } = message;
      setDraft(collection, id, locale ? { ...data, locale } : data);
      patchAll(document);
    } else if (message.type === "mode") {
      if (message.exclude) {
        excluded = excludedSelector(message.exclude);
        style.textContent = editStyle(excluded);
      }
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
  });

  const onClick = (e: MouseEvent) => {
    if (!html.hasAttribute("data-cms-edit") || !(e.target instanceof Element)) return;
    const bound = pickBound(e.target, excluded);
    if (!bound) return;
    e.preventDefault();
    e.stopPropagation();
    channel.post({ type: "edit", ...parseBinding(bound.getAttribute("data-cms")!) });
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && html.hasAttribute("data-cms-edit")) setEditMode(false);
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("popstate", channel.report);
  observer.observe(html, { childList: true, subtree: true, characterData: true });
  document.addEventListener("click", onClick, true);
  window.addEventListener("message", onMessage);
  channel.announce();

  const cleanupLive = () => {
    if (!active) return;
    active = false;
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("popstate", channel.report);
    window.removeEventListener("message", onMessage);
    observer.disconnect();
    style.remove();
    html.removeAttribute("data-cms-edit");
    highlight(null, null);
    document.removeEventListener("click", onClick, true);
  };
  const cleanup = () => {
    cleanupLive();
    bar?.stop();
  };
  return cleanup;
};

// The admin is the page that holds the iframe or opened the tab. Only its origin is trusted, and nothing goes out
// before its first message, so a page that frames the site learns nothing.
const openChannel = (admin: string | false) => {
  const host = window.parent !== window ? window.parent : window.opener;
  const origin = new URL(admin || "/", location.href).origin;
  let connected = false;
  let href = "";
  let reported = "";

  const post = (message: PreviewMessage) => connected && host?.postMessage(message, origin);

  // Tells the admin the page's URL and the documents it shows, whenever they change. Client-side navigation fires
  // no `ready`, so the URL is checked on every DOM change and `popstate`.
  const report = () => {
    if (!connected) return;
    if (location.href !== href) {
      href = location.href;
      post({ type: "url", href });
    }
    const documents = pageDocuments();
    const key = JSON.stringify(documents);
    if (key === reported) return;
    reported = key;
    post({ type: "documents", documents });
  };

  // Whether a message comes from the admin. The first one connects the channel.
  const accept = ({ source, origin: from }: MessageEvent) => {
    if (!host || source !== host || from !== origin) return false;
    if (!connected) {
      connected = true;
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
        if (!isActive()) continue;
        Idiomorph.morph(document.body, next.body);
        document.title = next.title;
        patchAll(document);
      } catch {}
    } while (again && isActive());
    busy = false;
  };
};
