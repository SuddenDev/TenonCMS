import { getSchema, type Extensions } from "@tiptap/core";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import { richtextExtensions } from "./extensions.ts";
import { checkRichtextContent } from "./validation.ts";
import type { RichtextDocument } from "../config/types.ts";

/** Content and custom extensions shared by the frontend renderers. */
export type RichtextProps = {
  content?: RichtextDocument | null;
  extensions?: Record<string, Extensions>;
};

/** Renders validated Tiptap JSON to HTML in browsers and on the server. */
export function renderRichtext(
  content: RichtextDocument | null | undefined,
  extensions: Record<string, Extensions> = {},
): string {
  if (!content) return "";

  const all = richtextExtensions(undefined, extensions);
  checkRichtextContent(content, getSchema(all));

  return renderToHTMLString({ content, extensions: all });
}
