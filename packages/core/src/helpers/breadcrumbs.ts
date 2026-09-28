// Helpers run in browser bundles too, so this file MUST have no imports.

/** Field names `breadcrumbs()` reads. Each defaults to the name in `page.fields`. */
export type BreadcrumbsOptions = {
  /** The field shown as the crumb's text. Default `'title'`. */
  title?: string;
  /** The field with the crumb's URL path. Default `'path'`. */
  path?: string;
  /** The relation to the parent document, resolved by `populate`. Default `'parent'`. */
  parent?: string;
};

/**
 * The breadcrumb trail of a document, from the root down to the document itself: one entry per resolved document in the
 * `parent` chain. The walk stops at a parent that is not an object (`null`, missing, or an id `populate` did not resolve),
 * so the read MUST resolve as many levels as the tree has. Makes no queries. A missing `title` or `path` reads as `''`.
 */
export function breadcrumbs(
  doc: Record<string, any>,
  { title = "title", path = "path", parent = "parent" }: BreadcrumbsOptions = {},
) {
  const trail: { title: string; path: string }[] = [];
  for (let d = doc; d && typeof d === "object"; d = d[parent])
    trail.unshift({ title: String(d[title] ?? ""), path: String(d[path] ?? "") });
  return trail;
}
