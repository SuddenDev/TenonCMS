# helpers

Small functions for rendering pages, exported from `integral-cms` and `integral-cms/client`.

| File             | What it does                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slugify.ts`     | `slugify()` and `SLUG_PATTERN`. The admin uses the same file.                                                                                                                                                                                                                                                                                                                       |
| `seo-meta.ts`    | `seoMeta(doc, settings?)`: the `<head>` values (title, description, noindex, canonical, alternates, image, verification). Uses the `general` and `seo` globals; the title falls back to the document title at render time. `alternates` (`{ hreflang, href }[]`) comes from `doc.alternates`; `canonical` is the document's own locale's URL there, else `general.url` plus `path`. |
| `breadcrumbs.ts` | `breadcrumbs()`: walks the populated `parent` chain. No queries.                                                                                                                                                                                                                                                                                                                    |
| `locale-path.ts` | `localeFromPath()`, `localizePath()` and `switchTarget()`: locale prefixes of URL paths and the target of a language switch. They take the `localization` config (`cms.localization`, or `client.localization()` in the browser) and read `locales`, `defaultLocale` and `routing`.                                                                                                 |

`switchTarget()` uses a document's published alternate when available, otherwise the target locale's homepage. Homepage fallbacks belong only in navigation; `seoMeta()` emits the published alternates as `hreflang` links.

Helpers MUST have no imports, so they run in the browser.
