import type { HTMLAttributes, ReactNode } from "react";
import { renderRichtext, type RichtextProps } from "../../richtext/runtime/render.ts";
import { type PrimitiveProps, renderPrimitive } from "./primitive.ts";

export type { RichtextProps } from "../../richtext/runtime/render.ts";

/** Renders rich text into an unstyled `as` element (a `div`), or its child with `asChild`, during SSR too. */
export function Richtext({
  content,
  extensions,
  as = "div",
  asChild,
  children,
  ...attrs
}: RichtextProps &
  PrimitiveProps &
  Omit<HTMLAttributes<HTMLElement>, "content" | "children" | "dangerouslySetInnerHTML"> & {
    children?: ReactNode;
  }) {
  const html = { __html: renderRichtext(content, extensions) };
  return renderPrimitive(
    as,
    asChild,
    { ...attrs, dangerouslySetInnerHTML: html },
    undefined,
    children,
  );
}
