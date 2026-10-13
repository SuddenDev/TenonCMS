import { expect, it } from "vitest";
import { isPreviewMessage } from "./message.ts";
it("validates every message shape before using it", () => {
  for (const value of [
    null,
    "ready",
    { type: "draft", collection: "x", id: "1", data: [] },
    { type: "mode", edit: 1 },
    { type: "documents", documents: [{}] },
    { type: "highlight", collection: {}, id: null },
    { type: "edit", collection: "x", id: "1" },
    { type: "draft", collection: "x", id: "1", data: {}, locale: 1 },
    { type: "saved", collection: "x", id: "1", locale: {} },
  ])
    expect(isPreviewMessage(value)).toBe(false);
  expect(isPreviewMessage({ type: "draft", collection: "x", id: "1", data: { title: "Hi" } })).toBe(
    true,
  );
  expect(isPreviewMessage({ type: "mode", edit: false })).toBe(true);
  expect(isPreviewMessage({ type: "saved", collection: "x", id: "1", locale: "de" })).toBe(true);
  expect(
    isPreviewMessage({ type: "draft", collection: "x", id: "1", data: {}, locale: "de" }),
  ).toBe(true);
});
