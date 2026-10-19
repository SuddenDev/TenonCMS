import { Node } from "@tiptap/core";
import { expect, it } from "vitest";
import { renderRichtext } from "./render.ts";
import type { RichtextDocument } from "../config/types.ts";

const document: RichtextDocument = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hello <world>" }] },
    {
      type: "paragraph",
      attrs: { textAlign: "center" },
      content: [
        {
          type: "text",
          text: "Link",
          marks: [
            { type: "bold" },
            {
              type: "link",
              attrs: {
                href: "/posts/hello",
                target: "_blank",
                reference: { collection: "posts", id: "1" },
              },
            },
          ],
        },
      ],
    },
    {
      type: "image",
      attrs: { src: "/image.webp", srcset: "/image-2x.webp 2x", alt: 'An "image"' },
    },
  ],
};

it("renders built-in formatting and resolved URLs on the server without changing JSON", () => {
  const original = structuredClone(document);
  const html = renderRichtext(document);

  expect(html).toContain("<h2>Hello &lt;world&gt;</h2>");
  expect(html).toContain("text-align: center");
  expect(html).toContain("<strong>");
  expect(html).toContain('href="/posts/hello"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain('src="/image.webp"');
  expect(html).toContain('srcset="/image-2x.webp 2x"');
  expect(html).toContain('alt="An &quot;image&quot;"');
  expect(html).not.toContain("font-size");
  expect(document).toEqual(original);
});

it("renders missing content as empty HTML", () => {
  expect(renderRichtext(null)).toBe("");
  expect(renderRichtext(undefined)).toBe("");
});

it("uses custom extension rendering and rejects missing extensions", () => {
  const Notice = Node.create({
    name: "notice",
    group: "block",
    content: "block+",
    renderHTML: () => ["aside", { role: "note" }, 0],
  });
  const content: RichtextDocument = {
    type: "doc",
    content: [
      {
        type: "notice",
        content: [{ type: "paragraph", content: [{ type: "text", text: "A note" }] }],
      },
    ],
  };

  expect(renderRichtext(content, { notice: [Notice] })).toBe(
    '<aside role="note"><p>A note</p></aside>',
  );
  expect(() => renderRichtext(content)).toThrow('Unsupported rich text type "notice"');
});

it("rejects unsafe URLs before emitting HTML", () => {
  for (const attrs of [{ src: "javascript:alert(1)" }, { srcset: "javascript:alert(1) 2x" }]) {
    expect(() => renderRichtext({ type: "doc", content: [{ type: "image", attrs }] })).toThrow(
      /Unsafe/,
    );
  }
});
