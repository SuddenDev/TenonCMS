import { expect, it } from "vitest";
import type { Fields } from "../../schema/index.ts";
import { dropUnknownKeys } from "./drop-unknown-keys.ts";

const fields = {
  author: { type: "relation", collection: "authors" },
  content: { type: "blocks", blocks: { note: { fields: { text: { type: "text" } } } } },
} as Fields;

it("keeps unknown block items and populated relations whole", () => {
  const doc = {
    id: "1",
    author: { id: "a", name: "Ann", gone: "x" },
    content: [
      { id: "b1", blockType: "note", text: "T", gone: "x" },
      { id: "b2", blockType: "old", gone: "x" },
    ],
    gone: "x",
  };
  dropUnknownKeys(fields, doc, ["id"]);
  expect(doc).toEqual({
    id: "1",
    author: { id: "a", name: "Ann", gone: "x" },
    content: [
      { id: "b1", blockType: "note", text: "T" },
      { id: "b2", blockType: "old", gone: "x" },
    ],
  });
});
