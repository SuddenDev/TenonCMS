import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import { sitemapXml } from "../../helpers/sitemap-xml.ts";
import { robotsText } from "../robots.ts";
import { sitemapEntries } from "../sitemap-entries.ts";

/**
 * `GET /sitemap.xml` and `GET /robots.txt` at the site root, outside `API_BASE`. An option set to `false` mounts no
 * route. Relative URLs resolve against the site URL, else the request's origin.
 */
export function seoRoutes(core: Core, site?: string) {
  const app = new Hono();

  if (core.sitemap)
    app.get("/sitemap.xml", async (c) => {
      const entries = await sitemapEntries(core, { site, origin: new URL(c.req.url).origin });
      return c.body(sitemapXml(entries), 200, { "content-type": "application/xml; charset=utf-8" });
    });

  if (core.robots)
    app.get("/robots.txt", async (c) =>
      c.text(await robotsText(core, { site, origin: new URL(c.req.url).origin })),
    );

  return app;
}
