import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { LinkRead } from "../../links/config/types.ts";
import { linkAttrs } from "../../links/runtime/link-attrs.ts";
import { type PrimitiveProps, renderPrimitive } from "./primitive.ts";

export type LinkProps = PrimitiveProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target"> & {
    link?: Partial<LinkRead> | null;
    children?: ReactNode;
  };

/**
 * Renders a populated `link` field. The children are the content, else the target's title. Renders nothing for a
 * broken or empty link. A component in `as`, like a router's `Link`, gets internal paths as `to`; other URLs render
 * a plain `<a>`. `target="_blank"` adds `rel="noopener noreferrer"`.
 * @example
 * <Link link={page.cta} as={RouterLink} className="button" />
 */
export function Link({ link, as = "a", asChild, children, ...attrs }: LinkProps) {
  const own = linkAttrs(link, typeof as !== "string");
  if (!own) return null;

  const tag = "to" in own || typeof as === "string" ? as : "a";
  const content = asChild ? undefined : (children ?? link?.title);
  return renderPrimitive(tag, asChild, { ...own, ...attrs }, content, children);
}
