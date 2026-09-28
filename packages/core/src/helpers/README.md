# helpers

Small functions for rendering pages, exported from `integral-cms` and `integral-cms/client`.

| File             | What it does                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `slugify.ts`     | `slugify()` and `SLUG_PATTERN`. The admin uses the same file.                                                              |
| `seo-meta.ts`    | `seoMeta()`: the `<head>` values (title, description, noindex). The title falls back to the document title at render time. |
| `breadcrumbs.ts` | `breadcrumbs()`: walks the populated `parent` chain. No queries.                                                           |

Helpers MUST have no imports, so they run in the browser.
