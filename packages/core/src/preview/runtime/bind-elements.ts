import { isObject } from "../../schema/condition.ts";
import { draftKey, getDrafts } from "./store.ts";

/**
 * The `data-cms` value that binds an element to a field. `id` is `null` for a global.
 * @example
 * <h1 data-cms={edit('pages', page.id, 'title')}>{page.title}</h1>
 * <img data-cms={edit('posts', post.id, 'hero')} data-cms-attr="src,srcset,alt" />
 */
export const edit = (collection: string, id: string | null, path: string) =>
  `${collection}:${id ?? ""}:${path}`;

const valueAt = (value: unknown, path: string) =>
  path.split(".").reduce<unknown>((v, key) => (isObject(v) ? v[key] : undefined), value);

/** Splits a `data-cms` value into its parts. A path MAY contain `:`. */
export function parseBinding(binding: string) {
  const [collection = "", id = "", ...path] = binding.split(":");
  return { collection, id, path: path.join(":") };
}

/**
 * Writes the draft value of a bound element: the attributes in `data-cms-attr`, else the text for a string, number or
 * `null`. Writes only changes, so the mutation observer settles.
 */
export function patch(el: Element) {
  const { collection, id, path } = parseBinding(el.getAttribute("data-cms") ?? "");
  const draft = getDrafts()[draftKey(collection, id)];
  if (!draft || !inPageLanguage(draft.locale)) return;

  const value = valueAt(draft, path);
  const attrs = el.getAttribute("data-cms-attr");
  if (attrs) patchAttributes(el, attrs, value);
  else if (typeof value === "string" || typeof value === "number" || value === null)
    patchText(el, value === null ? "" : String(value));
}

// A page MAY switch language while the admin edits another one. `<html lang>` names the page's language; without
// it, any draft applies.
function inPageLanguage(locale: unknown) {
  const lang = document.documentElement.lang.toLowerCase();
  if (typeof locale !== "string" || !lang) return true;
  const l = locale.toLowerCase();
  return lang === l || lang.startsWith(`${l}-`);
}

// From the value's keys when it is an object (a media document), else from the value itself.
function patchAttributes(el: Element, attrs: string, value: unknown) {
  for (const attr of attrs.split(",").map((a) => a.trim())) {
    const v = isObject(value) ? value[attr] : value;
    if (v === null || v === undefined) el.removeAttribute(attr);
    else if (el.getAttribute(attr) !== String(v)) el.setAttribute(attr, String(v));
  }
}

function patchText(el: Element, text: string) {
  const node = el.firstChild;
  // A lone text node is written in place, so a framework that tracks it keeps its reference.
  if (node instanceof Text && !node.nextSibling) {
    if (node.nodeValue !== text) node.nodeValue = text;
  } else if (el.textContent !== text) el.textContent = text;
}

/** Patches `root` and every bound element below it. */
export function patchAll(root: ParentNode) {
  if (root instanceof Element && root.matches("[data-cms]")) patch(root);
  for (const el of root.querySelectorAll("[data-cms]")) patch(el);
}

/** Outlines the elements bound to one document with `data-cms-highlight`. `null` only clears it. */
export function highlight(collection: string | null, id: string | null) {
  for (const el of document.querySelectorAll("[data-cms-highlight]"))
    el.removeAttribute("data-cms-highlight");
  if (collection === null) return;

  for (const el of document.querySelectorAll("[data-cms]")) {
    const bound = parseBinding(el.getAttribute("data-cms")!);
    if (bound.collection === collection && bound.id === id)
      el.setAttribute("data-cms-highlight", "");
  }
}

/** The documents and globals bound on the page, once each, in page order. A global has an empty id. */
export function boundDocuments() {
  const documents = new Map<string, { collection: string; id: string }>();
  for (const el of document.querySelectorAll("[data-cms]")) {
    const { collection, id } = parseBinding(el.getAttribute("data-cms")!);
    const key = draftKey(collection, id);
    if (!documents.has(key)) documents.set(key, { collection, id });
  }
  return [...documents.values()];
}
