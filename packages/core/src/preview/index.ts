// Browser entry of `integral-cms/preview`. Nothing MAY run at import time: Nitro bundles it into servers too.
// It MUST NOT import zod or core runtime code.
import { Idiomorph } from "idiomorph";

/** Unsaved form state by `<collection>:<id>`. Globals are keyed `<name>:`. */
export type Drafts = Record<string, Record<string, unknown>>;
export type Unsubscribe = () => void;

/** Messages on the `integral-cms:preview` channel between the admin and the site. */
export type PreviewMessage =
  | { type: "draft"; collection: string; id: string; data: Record<string, unknown> }
  | { type: "mode"; edit: boolean }
  | { type: "edit"; collection: string; id: string; path: string }
  | { type: "url"; href: string }
  | { type: "saved"; collection: string; id: string };

const CHANNEL = "integral-cms:preview";
// `API_BASE` of the client. Importing it would pull core code into the browser entry.
const API = "/api/cms";
const COOKIE = "integral-preview";
const BAR_STYLE =
  "[data-cms-bar]{position:fixed;inset:0 0 auto;height:32px;z-index:2147483647;display:flex;align-items:center;gap:12px;padding:0 12px;background:#18181b;color:#fafafa;font:13px/1 system-ui,sans-serif}" +
  "[data-cms-bar] a,[data-cms-bar] button,[data-cms-bar] label{color:inherit;font:inherit;text-decoration:none;background:none;border:0;padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px}" +
  "[data-cms-bar] :is(a,button):hover,[data-cms-bar] [aria-pressed=true]{background:#3f3f46}" +
  "[data-cms-bar] [data-end]{margin-left:auto}";
const STYLE =
  "[data-cms-edit] [data-cms]:hover{outline:2px dashed #3b82f6;outline-offset:2px;cursor:pointer}";

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

// One "Edit" link per document or global bound on the page.
function editLinks(admin: string) {
  const keys = new Set(
    [...document.querySelectorAll("[data-cms]")].map((el) => {
      const { collection, id } = parse(el.getAttribute("data-cms")!);
      return `${collection}:${id}`;
    }),
  );
  return [...keys].map((key) => {
    const [collection, id] = key.split(":") as [string, string];
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
export const preview: (options?: {
  /**
   * Re-renders the page on a `saved` message: fetches the current URL and morphs `<body>` and the title.
   * Server-rendered sites without client data (Astro) need it. Defaults to `false`.
   */
  morph?: boolean;
  /** The admin path, for the bars' links. `false` renders no admin bar. Defaults to `/admin`. */
  admin?: string | false;
}) => Unsubscribe = ({ morph = false, admin = "/admin" } = {}) => {
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
  const channel = new BroadcastChannel(CHANNEL);
  const post = (message: PreviewMessage) => channel.postMessage(message);
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

  channel.onmessage = ({ data }: MessageEvent<PreviewMessage>) => {
    if (data.type === "draft") {
      drafts = { ...drafts, [`${data.collection}:${data.id}`]: data.data };
      for (const cb of listeners) cb(drafts);
      patchAll(document);
    } else if (data.type === "mode") {
      html.toggleAttribute("data-cms-edit", data.edit);
      const input = document.querySelector<HTMLInputElement>("[data-cms-bar] input");
      if (input) input.checked = data.edit;
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

  post({ type: "url", href: location.href });
  const removeBar = name.startsWith("integral-preview-") ? bar("preview", admin || "") : undefined;

  stop = () => {
    stop = undefined;
    channel.close();
    observer.disconnect();
    style.remove();
    html.removeAttribute("data-cms-edit");
    document.removeEventListener("click", onClick, true);
    removeBar?.();
  };
  return stop;
};
