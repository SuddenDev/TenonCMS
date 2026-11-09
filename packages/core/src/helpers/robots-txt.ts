/** One group of `robots.txt`: the crawlers it names and the paths they MAY or MUST NOT crawl. */
export type RobotsRule = {
  userAgent: string | readonly string[];
  allow?: readonly string[];
  disallow?: readonly string[];
};

/** Renders a `robots.txt`. A group without `allow` and `disallow` allows everything. */
export function robotsTxt({
  rules,
  sitemaps = [],
}: {
  rules: readonly RobotsRule[];
  sitemaps?: readonly string[];
}) {
  const groups = rules.map(({ userAgent, allow = [], disallow = [] }) => {
    const agents = (typeof userAgent === "string" ? [userAgent] : userAgent).map(
      (agent) => `User-agent: ${agent}`,
    );
    const paths = [...allow.map((p) => `Allow: ${p}`), ...disallow.map((p) => `Disallow: ${p}`)];
    return [...agents, ...(paths.length ? paths : ["Disallow:"])].join("\n");
  });
  const sitemapLines = sitemaps.map((url) => `Sitemap: ${url}`);

  return [...groups, ...(sitemapLines.length ? [sitemapLines.join("\n")] : [])].join("\n\n") + "\n";
}
