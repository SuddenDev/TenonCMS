import type { LinkRead } from "../config/types.ts";

/**
 * The anchor attributes of a populated `link` field. With `router`, a path on this site goes into `to` for a router
 * component; URLs, `//host`, `mailto:` and `#hash` stay in `href`. `target="_blank"` adds `rel="noopener noreferrer"`.
 * @returns `undefined` for a broken or empty link.
 */
export function linkAttrs(link: Partial<LinkRead> | null | undefined, router = false) {
  const href = link?.href;
  if (!href) return undefined;

  const internal = router && href.startsWith("/") && !href.startsWith("//");
  return {
    ...(internal ? { to: href } : { href }),
    ...(link.target && link.target !== "_self" && { target: link.target }),
    ...(link.target === "_blank" && { rel: "noopener noreferrer" }),
  };
}
