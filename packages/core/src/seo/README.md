# seo

`/sitemap.xml` and `/robots.txt`, served by `cms.fetch` at the site root, outside `API_BASE`. User docs: [Pages and SEO](../../../../docs/content/1.guide/pages-and-seo.md#sitemap-and-robotstxt).

## Follow a sitemap request

`endpoints/routes.ts` → `sitemap-entries.ts` → `sitemapXml()` (`helpers/sitemap-xml.ts`)

`seoRoutes()` mounts a route only while its option is not `false`. `sitemapEntries()` reads as a visitor (`user: null`, published, access rules on), so a collection whose read rule denies visitors adds nothing. Each collection with a `permalink` and without `sitemap: false` is read once with `permalink: true` and `alternates: true` and `populate: false`. A document with alternates gives one entry per locale; otherwise its `permalink` is the entry. Then the host's `sitemap.entries` runs, then URLs become absolute against `site.url` (`core.site.url`), else the request's origin. `cms.sitemap()` has no request, so without `site.url` its URLs stay as given.

`isSiteNoindex()` (`site.ts`) reads the `seo` settings with access rules off, because they configure the site.

`robotsText()` builds the default groups (everything but `/_tenon/`, media allowed; or `Disallow: /` while the site is `noindex`), runs the host's `robots.rules`, and adds the `Sitemap:` line while the sitemap is on.

The adapters mount these paths through `integrations/admin/seo-routes.ts`, which skips a path the host serves itself.

## Files

| Path                  | Responsibility                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `config/types.ts`     | `SitemapOptions` and `RobotsOptions`, the `sitemap` and `robots` options of `defineCms()`. |
| `sitemap-entries.ts`  | `sitemapEntries()`: the entries of `/sitemap.xml` and of `cms.sitemap()`.                  |
| `robots.ts`           | `robotsText()`: the body of `/robots.txt`.                                                 |
| `site.ts`             | `isSiteNoindex()`.                                                                         |
| `endpoints/routes.ts` | `seoRoutes()`: the two routes. `createApp()` mounts them before the API.                   |

The renderers `sitemapXml()` and `robotsTxt()` live in `helpers/`, so they run anywhere.
