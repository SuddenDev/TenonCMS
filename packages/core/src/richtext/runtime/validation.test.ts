import { describe, expect, it } from "vitest";
import { validateRichtext } from "./validation.ts";
import { richtextExtensions } from "./extensions.ts";

const doc = (content: unknown[]) => ({ type: "doc", content });
const paragraph = (marks: unknown[] = []) => ({
  type: "paragraph",
  content: [{ type: "text", text: "Hello", marks }],
});

describe("rich text validation", () => {
  it("round trips standard JSON without HTML conversion", () => {
    const value = doc([paragraph([{ type: "bold" }])]);

    expect(() => validateRichtext(value, {})).not.toThrow();
    expect(value).toEqual(doc([paragraph([{ type: "bold" }])]));
  });

  it("enforces the feature whitelist and structural dependencies", () => {
    expect(() => validateRichtext(doc([paragraph([{ type: "bold" }])]), { allowed: [] })).toThrow();
    expect(() =>
      validateRichtext(
        doc([{ type: "bulletList", content: [{ type: "listItem", content: [paragraph()] }] }]),
        { allowed: ["bulletList"] },
      ),
    ).not.toThrow();
  });

  it("rejects executable URLs and invalid node structure", () => {
    expect(() =>
      validateRichtext(
        doc([paragraph([{ type: "link", attrs: { href: "javascript:alert(1)" } }])]),
        {},
      ),
    ).toThrow();
    expect(() => validateRichtext(doc([{ type: "heading", attrs: { level: 90 } }]), {})).toThrow();
    expect(() =>
      validateRichtext(doc([{ type: "text", text: "outside paragraph" }]), {}),
    ).toThrow();
  });

  it("requires meaningful content only for active required fields", () => {
    const empty = doc([{ type: "paragraph" }]);

    expect(() => validateRichtext(empty, { required: true })).toThrow();
    expect(() => validateRichtext(empty, {})).not.toThrow();
  });

  it("builds a schema without a browser", () => {
    expect(richtextExtensions().length).toBeGreaterThan(0);
  });
});

it("rejects unsafe srcset URLs and non-string URL attributes", () => {
  expect(() =>
    validateRichtext(
      {
        type: "doc",
        content: [{ type: "image", attrs: { src: "/safe.png", srcset: "javascript:alert(1) 2x" } }],
      },
      {},
    ),
  ).toThrow();
  expect(() =>
    validateRichtext({ type: "doc", content: [{ type: "image", attrs: { src: 0 } }] }, {}),
  ).toThrow();
});
