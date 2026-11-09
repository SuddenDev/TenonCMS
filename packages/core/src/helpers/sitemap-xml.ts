/** One page of a sitemap. */
export type SitemapEntry = {
  /** The page URL. The built-in route makes a relative URL absolute against the site URL. */
  url: string;
  /** When the page last changed. */
  lastmod?: string | Date;
  /** The URL of the page in each locale, keyed by `hreflang`, like `{ en: "/hello", de: "/de/hallo" }`. */
  alternates?: Record<string, string>;
};

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );

/**
 * Renders a `sitemap.xml` with `hreflang` alternates. URLs are written as given, so pass absolute ones.
 * @example
 * new Response(sitemapXml(await cms.sitemap()), { headers: { "content-type": "application/xml" } })
 */
export function sitemapXml(entries: readonly SitemapEntry[]) {
  const urls = entries.map(({ url, lastmod, alternates = {} }) => {
    const date = lastmod instanceof Date ? lastmod.toISOString() : lastmod;
    const links = Object.entries(alternates).map(
      ([lang, href]) =>
        `<xhtml:link rel="alternate" hreflang="${escapeXml(lang)}" href="${escapeXml(href)}"/>`,
    );
    return `<url><loc>${escapeXml(url)}</loc>${date ? `<lastmod>${escapeXml(date)}</lastmod>` : ""}${links.join("")}</url>\n`;
  });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls.join("") +
    "</urlset>\n"
  );
}
