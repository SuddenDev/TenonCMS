import { API_BASE } from "../client/constants.ts";
import type { Core } from "../cms/runtime/types.ts";
import { outerScope } from "../cms/runtime/operation-context.ts";
import { type RobotsRule, robotsTxt } from "../helpers/robots-txt.ts";
import { isSiteNoindex, siteUrl } from "./site.ts";

/**
 * The `robots.txt` of the site: everything but the API is allowed, media included, unless the `seo` settings say
 * `noindex`. The host's `robots.rules` change the groups. The `Sitemap:` line follows while the sitemap is on.
 */
export async function robotsText(core: Core, { site, origin }: { site?: string; origin: string }) {
  const defaults: RobotsRule[] = (await isSiteNoindex(core))
    ? [{ userAgent: "*", disallow: ["/"] }]
    : [{ userAgent: "*", allow: ["/", `${API_BASE}/media/`], disallow: [`${API_BASE}/`] }];
  const cms = core.localApi(outerScope({ user: null, perspective: "published" }));
  const rules =
    core.robots && core.robots.rules ? await core.robots.rules({ cms, rules: defaults }) : defaults;

  const base = (await siteUrl(core, site, origin))!;
  return robotsTxt({ rules, sitemaps: core.sitemap ? [new URL("/sitemap.xml", base).href] : [] });
}
