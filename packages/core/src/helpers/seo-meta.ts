// Helpers run in browser bundles too, so this file MUST have no imports.

type SeoDoc = { title?: unknown; seo?: { title?: string | null; description?: string | null; noindex?: boolean | null } | null }

/**
 * The `<head>` values of a document with `seo.fields`. Stores nothing.
 * - `title`: `seo.title`, or the document's `title` when it is empty. So the fallback follows title changes.
 * - `description`: `seo.description`, or `undefined`. There is no fallback.
 * - `noindex`: `true` only when `seo.noindex` is `true`.
 */
export function seoMeta(doc: SeoDoc) {
  return {
    title: doc.seo?.title || String(doc.title ?? ''),
    description: doc.seo?.description || undefined,
    noindex: doc.seo?.noindex === true,
  }
}
