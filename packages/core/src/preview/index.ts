// Browser entry of `integral-cms/preview`. Nothing MAY run at import time: Nitro bundles it into servers too.
// It MUST NOT import zod or core runtime code.

/** Unsaved form state by `<collection>:<id>`. Globals are keyed `<name>:`. */
export type Drafts = Record<string, Record<string, unknown>>;
export type Unsubscribe = () => void;

/** Messages on the `integral-cms:preview` channel between the admin and the site. */
export type PreviewMessage =
  | { type: "draft"; collection: string; id: string; data: Record<string, unknown> }
  | { type: "mode"; edit: boolean }
  | { type: "edit"; collection: string; id: string; path: string }
  | { type: "url"; href: string };

const CHANNEL = "integral-cms:preview";
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

/**
 * Starts the live preview runtime. It does nothing unless the page runs in the admin's preview (`window.name` starts
 * with `integral-preview`). Calling it again returns the same stop function.
 * `morph` is reserved for re-rendering server pages and has no effect yet.
 */
export const preview: (options?: { morph?: boolean }) => Unsubscribe = () => {
  if (stop) return stop;
  if (!globalThis.window?.name.startsWith("integral-preview")) return () => {};
  const html = document.documentElement;
  const channel = new BroadcastChannel(CHANNEL);
  const post = (message: PreviewMessage) => channel.postMessage(message);
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  channel.onmessage = ({ data }: MessageEvent<PreviewMessage>) => {
    if (data.type === "draft") {
      drafts = { ...drafts, [`${data.collection}:${data.id}`]: data.data };
      for (const cb of listeners) cb(drafts);
      patchAll(document);
    } else if (data.type === "mode") {
      html.toggleAttribute("data-cms-edit", data.edit);
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

  stop = () => {
    stop = undefined;
    channel.close();
    observer.disconnect();
    style.remove();
    html.removeAttribute("data-cms-edit");
    document.removeEventListener("click", onClick, true);
  };
  return stop;
};
