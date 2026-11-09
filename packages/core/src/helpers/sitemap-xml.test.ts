import { expect, it } from "vitest";
import { sitemapXml } from "./sitemap-xml.ts";

it("renders an empty sitemap", () => {
  expect(sitemapXml([])).toBe(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
      "</urlset>\n",
  );
});

it("renders entries with lastmod and alternates, escaped", () => {
  const xml = sitemapXml([
    { url: "https://a.co/?x=1&y=<2>" },
    {
      url: "https://a.co/de/hallo",
      lastmod: new Date("2026-01-02T03:04:05.000Z"),
      alternates: { en: "https://a.co/hello", de: "https://a.co/de/hallo" },
    },
  ]);

  expect(xml).toContain("<url><loc>https://a.co/?x=1&amp;y=&lt;2&gt;</loc></url>");
  expect(xml).toContain(
    "<url><loc>https://a.co/de/hallo</loc><lastmod>2026-01-02T03:04:05.000Z</lastmod>" +
      '<xhtml:link rel="alternate" hreflang="en" href="https://a.co/hello"/>' +
      '<xhtml:link rel="alternate" hreflang="de" href="https://a.co/de/hallo"/></url>',
  );
});
