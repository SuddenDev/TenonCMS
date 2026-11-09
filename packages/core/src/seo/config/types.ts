import type { LocalApi } from "../../cms/api/local-api.ts";
import type { RobotsRule } from "../../helpers/robots-txt.ts";
import type { SitemapEntry } from "../../helpers/sitemap-xml.ts";

export type { RobotsRule, SitemapEntry };

/** The `sitemap` option of `defineCms()`. */
export type SitemapOptions = {
  /**
   * Gets the generated entries and returns the sitemap's. Add your own routes, drop or change entries. `cms` reads as
   * a visitor. Relative URLs become absolute against the site URL.
   * @example
   * entries: ({ entries }) => [...entries, { url: "/contact" }]
   */
  entries?: (args: {
    cms: LocalApi;
    entries: SitemapEntry[];
  }) => SitemapEntry[] | Promise<SitemapEntry[]>;
};

/** The `robots` option of `defineCms()`. */
export type RobotsOptions = {
  /**
   * Gets the default groups and returns the file's. The `Sitemap:` line follows them while the sitemap is on.
   * @example
   * rules: ({ rules }) => [...rules, { userAgent: "GPTBot", disallow: ["/"] }]
   */
  rules?: (args: { cms: LocalApi; rules: RobotsRule[] }) => RobotsRule[] | Promise<RobotsRule[]>;
};
