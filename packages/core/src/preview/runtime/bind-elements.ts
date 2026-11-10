import { isObject } from "../../schema/condition.ts";
import type { DocumentRef, Excluded } from "../config/types.ts";
import { draftKey, getDrafts, readDocuments } from "./store.ts";

/**
 * The `data-cms` value that binds an element to a field. `id` is `null` for a global.
 * @example
 * <h1 data-cms={edit('pages', page.id, 'title')}>{page.title}</h1>
 * <img data-cms={edit('posts', post.id, 'hero')} data-cms-attr="src,srcset,alt" />
 */
export const edit = (collection: string, id: string | null, path: string) =>
  `${collection}:${id ?? ""}:${path}`;

/** Where a blocks field lives, for click-to-edit. `id` is `null` for a global. */
export type BlocksEdit = { collection: string; id: string | null; path: string };

/**
 * The `data-cms` value of `path` inside `block` of a blocks field, or of the block itself without a path. The admin
 * addresses blocks by index. Drafts replace block objects, so the index comes from the block or its `id`.
 * @returns `undefined` without `field`, or for a block that is not in `blocks`.
 */
export function editBlock(
  field: BlocksEdit | undefined,
  blocks: readonly { id?: string }[] | null | undefined,
  block: { id?: string },
  path?: string,
) {
  const index = blocks?.findIndex((b) => b === block || (!!b.id && b.id === block.id));
  if (!field || index === undefined || index < 0) return undefined;
  const at = `${field.path}.${index}`;
  return edit(field.collection, field.id, path ? `${at}.${path}` : at);
}

// Steps into objects by key and into arrays (blocks, array fields, many relations) by index.
const valueAt = (value: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (v, key) =>
        isObject(v) || Array.isArray(v) ? (v as Record<string, unknown>)[key] : undefined,
      value,
    );

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

/**
 * A selector of the elements bound to an excluded collection or global. A collection binding starts with `<name>:` and
 * a global one with `<name>::`, so a global never matches a collection's rule.
 * @returns The selector, or `null` when nothing is excluded.
 */
export function excludedSelector({ collections, globals }: Excluded) {
  const starts = (prefix: string) => `[data-cms^="${CSS.escape(prefix)}"]`;
  const selectors = [
    ...collections.map((c) => `${starts(`${c}:`)}:not(${starts(`${c}::`)})`),
    ...globals.map((g) => starts(`${g}::`)),
  ];
  return selectors.length ? selectors.join(",") : null;
}

/**
 * The element an edit click on `target` picks: the closest bound one that `excluded` does not match.
 * @returns The element, or `null` when there is none.
 */
export function pickBound(target: Element, excluded: string | null) {
  let el = target.closest("[data-cms]");
  while (el && excluded && el.matches(excluded))
    el = el.parentElement?.closest("[data-cms]") ?? null;
  return el;
}

/** The documents and globals the page shows, once each: bound ones in page order, then the page's reads. */
export function pageDocuments() {
  const bound = [...document.querySelectorAll("[data-cms]")].map((el) =>
    parseBinding(el.getAttribute("data-cms")!),
  );
  const documents = new Map<string, DocumentRef>();
  for (const { collection, id } of [...bound, ...readDocuments()]) {
    const key = draftKey(collection, id);
    if (!documents.has(key)) documents.set(key, { collection, id });
  }
  return [...documents.values()];
}
