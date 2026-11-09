import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROUTES = { sitemap: "/sitemap.xml", robots: "/robots.txt" } as const;

/**
 * The site routes an adapter mounts: `/sitemap.xml` and `/robots.txt`, unless its option is `false` or the host
 * serves the path itself, from a file in `publicDir` or a route file in one of `routeDirs` (`sitemap.xml.ts`,
 * `sitemap.xml.get.ts`, a `sitemap.xml/` folder). A route the host adds later needs a dev server restart.
 */
export function siteRoutes(
  options: { sitemap?: boolean; robots?: boolean },
  publicDir: string,
  routeDirs: string[],
) {
  const files = routeDirs.flatMap((dir) => (existsSync(dir) ? readdirSync(dir) : []));
  const owned = (name: string) =>
    existsSync(join(publicDir, name)) || files.some((f) => f === name || f.startsWith(`${name}.`));

  return (Object.keys(ROUTES) as (keyof typeof ROUTES)[])
    .filter((key) => options[key] !== false)
    .map((key) => ROUTES[key])
    .filter((route) => !owned(route.slice(1)));
}
