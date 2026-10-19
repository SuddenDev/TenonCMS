import { createElement, type HTMLAttributes } from "react";
import { renderRichtext, type RichtextProps } from "../../richtext/runtime/render.ts";

export type { RichtextProps } from "../../richtext/runtime/render.ts";

/** Renders rich text in an unstyled div, including during SSR. */
export function Richtext({
  content,
  extensions,
  ...attrs
}: RichtextProps &
  Omit<HTMLAttributes<HTMLDivElement>, "content" | "children" | "dangerouslySetInnerHTML">) {
  return createElement("div", {
    ...attrs,
    dangerouslySetInnerHTML: { __html: renderRichtext(content, extensions) },
  });
}
