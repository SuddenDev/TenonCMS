// @vitest-environment happy-dom
import { undoDepth } from "@tiptap/pm/history";
import { afterEach, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { richtextExtensions } from "../../../../../../../core/src/richtext/runtime/extensions";
import { storedRichtext } from "../../../../../../../core/src/richtext/runtime/walk";
import type { RichtextDocument } from "../../../../../../../core/src/richtext/config/types";
import { decorateReferences } from "./decorate";

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

it("limits HTML insertion and keyboard formatting to the field whitelist", () => {
  editor = new Editor({ extensions: richtextExtensions([]), content: "<p>Hello</p>" });
  editor.commands.selectAll();
  editor.commands.keyboardShortcut("Mod-b");
  editor.commands.insertContent("<h1><strong>Plain text</strong></h1>");

  expect(editor.getJSON()).toMatchObject({
    content: [{ type: "paragraph", content: [{ type: "text", text: "Plain text" }] }],
  });
  expect(JSON.stringify(editor.getJSON())).not.toContain('"bold"');
  expect(JSON.stringify(editor.getJSON())).not.toContain('"heading"');
});

it("decorates media and links without persisting URLs or moving selection", () => {
  const value: RichtextDocument = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "A page",
            marks: [{ type: "link", attrs: { reference: { collection: "pages", id: "page" } } }],
          },
        ],
      },
      { type: "image", attrs: { reference: { collection: "media", id: "image" } } },
    ],
  };
  editor = new Editor({ extensions: richtextExtensions(), content: value });
  editor.commands.setTextSelection(3);
  const history = undoDepth(editor.state);
  const decorated = structuredClone(value);
  decorated.content![0].content![0].marks![0].attrs!.href = "/page";
  decorated.content![1].attrs!.src = "/files/image.png";
  decorateReferences(editor, decorated);

  expect(editor.state.selection.from).toBe(3);
  expect(editor.getHTML()).toContain('src="/files/image.png"');

  const stored = storedRichtext(editor.getJSON() as RichtextDocument);

  expect(stored.content![0].content![0].marks![0].attrs).not.toHaveProperty("href");
  expect(stored.content![1].attrs).not.toHaveProperty("src");
  expect(undoDepth(editor.state)).toBe(history);
});

it("preserves relation identities when content is copied as HTML", () => {
  editor = new Editor({
    extensions: richtextExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Page",
              marks: [
                {
                  type: "link",
                  attrs: { href: "/page", reference: { collection: "pages", id: "page" } },
                },
              ],
            },
          ],
        },
      ],
    },
  });
  const html = editor.getHTML();
  editor.commands.setContent(html);

  expect(editor.getJSON().content?.[0].content?.[0].marks?.[0].attrs?.reference).toEqual({
    collection: "pages",
    id: "page",
  });
});

it("resolves an image and file link to the same media independently", () => {
  const document: RichtextDocument = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Download",
            marks: [
              {
                type: "link",
                attrs: { reference: { collection: "media", id: "same" }, href: "/original.png" },
              },
            ],
          },
        ],
      },
      {
        type: "image",
        attrs: { reference: { collection: "media", id: "same" }, src: "/variant.webp" },
      },
    ],
  };
  editor = new Editor({ extensions: richtextExtensions(), content: document });
  decorateReferences(editor, document);

  expect(editor.getJSON().content?.[0].content?.[0].marks?.[0].attrs?.href).toBe("/original.png");
  expect(editor.getJSON().content?.[1].attrs?.src).toBe("/variant.webp");
});

it("serializes reactive reference attributes from editor dialogs", async () => {
  const { reactive } = await import("vue");
  const document: RichtextDocument = {
    type: "doc",
    content: [
      { type: "image", attrs: { reference: reactive({ collection: "media", id: "image" }) } },
    ],
  };

  expect(() => storedRichtext(document)).not.toThrow();
  expect(storedRichtext(document).content?.[0].attrs?.reference).toEqual({
    collection: "media",
    id: "image",
  });
});
