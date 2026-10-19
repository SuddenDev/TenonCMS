import { getSchema } from "@tiptap/core";
import { richtextExtensions } from "integral-cms/richtext";
import { expect, it } from "vitest";
import { Notice } from "./notice.ts";
import { notice } from "./admin/richtext.ts";
it("shares the notice wrapper schema between the server and browser", () => {
  const document = {
    type: "doc",
    content: [
      {
        type: "exampleNotice",
        content: [{ type: "paragraph", content: [{ type: "text", text: "A notice" }] }],
      },
    ],
  };

  for (const extensions of [[Notice], notice.extensions]) {
    expect(() =>
      getSchema(richtextExtensions(undefined, { exampleNotice: extensions }))
        .nodeFromJSON(document)
        .check(),
    ).not.toThrow();
  }
});
