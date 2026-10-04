import { getDrafts } from "./store.ts";

const isObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * The `data-cms` value that binds an element to a field. `id` is `null` for a global.
 * @example
 * <h1 data-cms={edit('pages', page.id, 'title')}>{page.title}</h1>
 * <img data-cms={edit('posts', post.id, 'hero')} data-cms-attr="src,srcset,alt" />
 */
export const edit = (collection: string, id: string | null, path: string) =>
  `${collection}:${id ?? ""}:${path}`;

const get = (value: unknown, path: string) =>
  path.split(".").reduce<unknown>((v, key) => (isObject(v) ? v[key] : undefined), value);

export function parse(key: string) {
  const [collection = "", id = "", ...path] = key.split(":");
  return { collection, id, path: path.join(":") };
}

// Text for a string or number, or the attributes in `data-cms-attr`. Writes only changes, so the observer settles.
export function patch(el: Element) {
  const { collection, id, path } = parse(el.getAttribute("data-cms") ?? "");
  const draft = getDrafts()[`${collection}:${id}`];
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

export function patchAll(root: ParentNode) {
  if (root instanceof Element && root.matches("[data-cms]")) patch(root);
  for (const el of root.querySelectorAll("[data-cms]")) patch(el);
}

// The documents and globals bound on the page, once each, in page order. A global has an empty id.
export function boundDocuments() {
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
