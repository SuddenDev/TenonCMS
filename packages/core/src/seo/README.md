# seo

`/sitemap.xml` and `/robots.txt`, served by `cms.fetch` at the site root, outside `API_BASE`. User docs: [Pages and SEO](../../../../docs/guide/pages-and-seo.md#sitemap-and-robotstxt).

## Follow a sitemap request

`endpoints/routes.ts` → `sitemap-entries.ts` → `site.ts` → `sitemapXml()` (`helpers/sitemap-xml.ts`)

`seoRoutes()` mounts a route only while its option is not `false`. `sitemapEntries()` reads as a visitor (`user: null`, published, access rules on), so a collection whose read rule denies visitors adds nothing. Each collection with a `permalink` and without `sitemap: false` is read once with `permalink: true` and `alternates: true` and `populate: false`. A document with alternates gives one entry per locale; otherwise its `permalink` is the entry. Then the host's `sitemap.entries` runs, then URLs become absolute against `siteUrl()`.

`siteUrl()` is the `url` of the `general` settings, then the `site` option, then the request's origin. It and `isSiteNoindex()` read the settings with access rules off, because they configure the site.

`robotsText()` builds the default groups (everything but `/_tenon/`, media allowed; or `Disallow: /` while the site is `noindex`), runs the host's `robots.rules`, and adds the `Sitemap:` line while the sitemap is on.

The adapters mount these paths through `integrations/admin/seo-routes.ts`, which skips a path the host serves itself.

## Files

| Path                  | Responsibility                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `config/types.ts`     | `SitemapOptions` and `RobotsOptions`, the `sitemap` and `robots` options of `defineCms()`. |
| `sitemap-entries.ts`  | `sitemapEntries()`: the entries of `/sitemap.xml` and of `cms.sitemap()`.                  |
| `robots.ts`           | `robotsText()`: the body of `/robots.txt`.                                                 |
| `site.ts`             | `siteUrl()` and `isSiteNoindex()`.                                                         |
| `endpoints/routes.ts` | `seoRoutes()`: the two routes. `createApp()` mounts them before the API.                   |

The renderers `sitemapXml()` and `robotsTxt()` live in `helpers/`, so they run anywhere.
