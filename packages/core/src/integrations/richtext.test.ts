import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { expect, it } from "vitest";
import { Richtext as ReactRichtext } from "./react/richtext.ts";
import { Richtext as VueRichtext } from "./vue/richtext.ts";
import type { RichtextDocument } from "../richtext/config/types.ts";

const content: RichtextDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello <world>" }] }],
};

it("renders React HTML on the server and forwards wrapper attributes", () => {
  const html = renderToStaticMarkup(
    createElement(ReactRichtext, { content, className: "prose", id: "body" }),
  );

  expect(html).toBe('<div class="prose" id="body"><p>Hello &lt;world&gt;</p></div>');
});

it("renders Vue HTML on the server and forwards wrapper attributes", async () => {
  const html = await renderToString(
    createSSRApp({ render: () => h(VueRichtext, { content, class: "prose", id: "body" }) }),
  );

  expect(html).toBe('<div class="prose" id="body"><p>Hello &lt;world&gt;</p></div>');
});
