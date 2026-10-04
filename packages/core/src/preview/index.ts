// Browser entry of `integral-cms/preview`. Nothing MAY run at import time: Nitro bundles it into servers too.
// It MUST NOT import zod or core runtime code.
import { Idiomorph } from "idiomorph";

import type { Drafts, Unsubscribe, PreviewMessage, PreviewOptions } from "./config/types.ts";
export type { Drafts, Unsubscribe, PreviewMessage } from "./config/types.ts";

// `API_BASE` of the client. Importing it would pull core code into the browser entry.
const API = "/api/cms";
const COOKIE = "integral-preview";
const BAR_STYLE =
  "[data-cms-bar]{all:initial;position:fixed;inset:0 0 auto;height:32px;z-index:2147483647;box-sizing:border-box;display:flex;align-items:center;gap:4px;padding:0 8px;background:rgb(24 24 27/.92);backdrop-filter:blur(8px);border-bottom:1px solid rgb(255 255 255/.08);color:#e4e4e7;font:500 12px/1 ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}" +
  "[data-cms-bar] *{box-sizing:border-box}" +
  "[data-cms-bar] :is(a,button,label){all:unset;display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border-radius:6px;cursor:pointer;white-space:nowrap;color:inherit}" +
  "[data-cms-bar] :is(a,button,label):hover{background:rgb(255 255 255/.08);color:#fff}" +
  "[data-cms-bar] :is(a,button,label):focus-visible{outline:2px solid #3b82f6;outline-offset:-2px}" +
  "[data-cms-bar] a:first-child{font-weight:600;color:#fff}" +
  "[data-cms-bar] input{all:unset;width:24px;height:14px;border-radius:7px;background:#52525b;position:relative;transition:background .15s}" +
  "[data-cms-bar] input::after{content:'';position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#fff;transition:transform .15s}" +
  "[data-cms-bar] input:checked{background:#3b82f6}[data-cms-bar] input:checked::after{transform:translateX(10px)}" +
  "[data-cms-bar] [data-end]{margin-left:auto;display:flex;padding:2px;gap:2px;border-radius:8px;background:rgb(255 255 255/.06)}" +
  "[data-cms-bar] [data-end] button{height:20px}" +
  "[data-cms-bar] [data-end] button::before{content:'';width:6px;height:6px;border-radius:50%;background:#10b981}" +
  "[data-cms-bar] [data-end] button:first-child::before{background:#f59e0b}" +
  "[data-cms-bar] [aria-pressed=true]{background:rgb(255 255 255/.14);color:#fff}" +
  "[data-cms-bar] [data-end]~button{margin-left:4px}" +
  "@media (prefers-reduced-motion:reduce){[data-cms-bar] *{transition:none!important}}";
const STYLE =
  "[data-cms-edit] [data-cms]:hover{outline:2px dashed #3b82f6;outline-offset:2px;cursor:pointer}" +
  "[data-cms-highlight]{outline:2px solid #3b82f6!important;outline-offset:2px;background:rgb(59 130 246/.08)}";

/**
 * The `data-cms` value that binds an element to a field. `id` is `null` for a global.
 * @example
 * <h1 data-cms={edit('pages', page.id, 'title')}>{page.title}</h1>
 * <img data-cms={edit('posts', post.id, 'hero')} data-cms-attr="src,srcset,alt" />
 */
export const edit = (collection: string, id: string | null, path: string) =>
  `${collection}:${id ?? ""}:${path}`;

const isObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const idOf = (v: unknown) => (isObject(v) ? v.id : v);

// A draft holds ids where the page holds populated documents. The browser cannot populate, so equal ids keep the page's value.
function sameIds(draft: unknown, current: unknown) {
  const ids = Array.isArray(draft) ? draft : [draft];
  const now = (Array.isArray(current) ? current : [current]).map(idOf);
  return (
    ids.every((id) => typeof id === "string") &&
    ids.length === now.length &&
    ids.every((id, i) => id === now[i])
  );
}

/**
 * Applies the draft of `doc` to it: draft values replace top-level keys. For a global, pass its name as `collection`.
 * A relation whose ids did not change keeps its populated value.
 */
export function merge<T>(collection: string, doc: T, drafts: Drafts): T {
  if (!isObject(doc)) return doc;
  const draft = drafts[`${collection}:${doc.id ?? ""}`];
  if (!draft) return doc;
  const out: Record<string, unknown> = { ...doc };
  for (const [key, value] of Object.entries(draft))
    out[key] = sameIds(value, doc[key]) ? doc[key] : value;
  return out as T;
}

let drafts: Drafts = {};
const listeners = new Set<(drafts: Drafts) => void>();
let stop: Unsubscribe | undefined;

/** The current drafts. A new object after every change, so it works as an external store snapshot. */
export const getDrafts = () => drafts;

/** Calls `cb` with all drafts whenever the admin pushes one. */
export function subscribe(cb: (drafts: Drafts) => void): Unsubscribe {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const get = (value: unknown, path: string) =>
  path.split(".").reduce<unknown>((v, key) => (isObject(v) ? v[key] : undefined), value);

function parse(key: string) {
  const [collection = "", id = "", ...path] = key.split(":");
  return { collection, id, path: path.join(":") };
}

// Text for a string or number, or the attributes in `data-cms-attr`. Writes only changes, so the observer settles.
function patch(el: Element) {
  const { collection, id, path } = parse(el.getAttribute("data-cms") ?? "");
  const draft = drafts[`${collection}:${id}`];
  if (!draft) return;
  const value = get(draft, path);
  const attrs = el.getAttribute("data-cms-attr");
  if (attrs) {
    for (const attr of attrs.split(",").map((a) => a.trim())) {
      const v = isObject(value) ? value[attr] : value;
      if (v === null || v === undefined) el.removeAttribute(attr);
      else if (el.getAttribute(attr) !== String(v)) el.setAttribute(attr, String(v));
    }
  } else if (typeof value === "string" || typeof value === "number" || value === null) {
    const text = value === null ? "" : String(value);
    const node = el.firstChild;
    // A lone text node is written in place, so a framework that tracks it keeps its reference.
    if (node instanceof Text && !node.nextSibling) {
      if (node.nodeValue !== text) node.nodeValue = text;
    } else if (el.textContent !== text) el.textContent = text;
  }
}

function patchAll(root: ParentNode) {
  if (root instanceof Element && root.matches("[data-cms]")) patch(root);
  for (const el of root.querySelectorAll("[data-cms]")) patch(el);
}

const perspective = () =>
  document.cookie.split(";").some((c) => c.trim() === `${COOKIE}=drafts`) ? "drafts" : "published";

async function setPerspective(value: string) {
  await fetch(`${API}/preview`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ perspective: value }),
  });
  location.reload();
}

// The documents and globals bound on the page, once each, in page order. A global has an empty id.
function boundDocuments() {
  const keys = new Set(
    [...document.querySelectorAll("[data-cms]")].map((el) => {
      const { collection, id } = parse(el.getAttribute("data-cms")!);
      return `${collection}:${id}`;
    }),
  );
  return [...keys].map((key) => {
    const [collection = "", id = ""] = key.split(":");
    return { collection, id };
  });
}

// One "Edit" link per document or global bound on the page.
function editLinks(admin: string) {
  return boundDocuments().map(({ collection, id }) => {
    const a = document.createElement("a");
    a.textContent = `Edit ${collection}`;
    a.href = `${admin}/presentation/${id ? `collections/${collection}/${id}` : `globals/${collection}`}`;
    return a;
  });
}

/**
 * The bar at the top of the page. `preview` (a preview tab): an edit switch, the perspective and "Exit preview".
 * `admin` (a signed-in user on the site): a link to the admin, one edit link per bound document and the perspective.
 * Returns the function that removes it.
 */
function bar(kind: "preview" | "admin", admin: string) {
  const html = document.documentElement;
  const root = document.createElement("div");
  root.setAttribute("data-cms-bar", "");
  const style = document.createElement("style");
  style.textContent = BAR_STYLE;
  const button = (text: string, onclick: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.onclick = onclick;
    return b;
  };

  const links = document.createElement("span");
  links.style.display = "contents";
  const scan = () => links.replaceChildren(...editLinks(admin));
  if (kind === "admin") {
    const home = document.createElement("a");
    home.textContent = "Admin";
    home.href = admin;
    scan();
    root.append(home, links);
  } else {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.checked = html.hasAttribute("data-cms-edit");
    input.onchange = () => html.toggleAttribute("data-cms-edit", input.checked);
    label.append(input, "Edit");
    root.append(label);
  }

  const toggle = document.createElement("span");
  toggle.setAttribute("data-end", "");
  toggle.style.display = "flex";
  const current = perspective();
  for (const [value, text] of [
    ["drafts", "Drafts"],
    ["published", "Published"],
  ] as const) {
    const b = button(text, () => value !== current && void setPerspective(value));
    b.setAttribute("aria-pressed", String(value === current));
    toggle.append(b);
  }
  root.append(toggle);
  if (kind === "preview")
    root.append(
      button("Exit preview", () => {
        window.name = "";
        location.reload();
      }),
    );

  // Outside `<body>`, so a morph or a framework render does not remove it.
  html.append(style, root);
  const margin = html.style.marginTop;
  html.style.marginTop = "32px";
  document.addEventListener("DOMContentLoaded", scan);
  return () => {
    root.remove();
    style.remove();
    html.style.marginTop = margin;
    document.removeEventListener("DOMContentLoaded", scan);
  };
}

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
      drafts = { ...drafts, [`${data.collection}:${data.id}`]: data.data };
      for (const cb of listeners) cb(drafts);
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
