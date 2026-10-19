import { Node } from "@tiptap/core";

/** A tiny extension shared by server validation, the editor and host renderers. */
export const Notice = Node.create({
  name: "exampleNotice",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: "aside[data-example-notice]" }],
  renderHTML: () => ["aside", { "data-example-notice": "", role: "note" }, 0],
});
