import { describe, expect, it } from "vitest";
import { checkRichtextField, pruneRichtext, validateRichtext } from "./validation.ts";
import { richtextExtensions, richtextSchema } from "./extensions.ts";
import type { RichtextDocument } from "../config/types.ts";

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

describe("default features", () => {
  it("enables a short list without `allowed`, and more with it", () => {
    const underline = doc([paragraph([{ type: "underline" }])]);

    expect(() => validateRichtext(doc([paragraph([{ type: "bold" }])]), {})).not.toThrow();
    expect(() => validateRichtext(underline, {})).toThrow(/Unsupported rich text type "underline"/);
    expect(() => validateRichtext(underline, { allowed: ["underline"] })).not.toThrow();
  });
});

describe("classes", () => {
  const classes = [
    { name: "lead", on: "block" },
    { name: "text-brand font-bold", on: "text" },
  ] as const;
  const block = (name: string) => ({ ...paragraph(), attrs: { class: name } });
  const text = (name: string) => paragraph([{ type: "textClass", attrs: { class: name } }]);

  it("accepts the listed classes on blocks and text", () => {
    expect(() =>
      validateRichtext(doc([block("lead"), text("text-brand font-bold")]), { classes }),
    ).not.toThrow();
  });

  it("rejects a class that is not listed for its place", () => {
    expect(() => validateRichtext(doc([block("other")]), { classes })).toThrow(
      /Unknown class "other"/,
    );
    expect(() => validateRichtext(doc([text("lead")]), { classes })).toThrow(
      /Unknown class "lead"/,
    );
    expect(() => validateRichtext(doc([block("lead")]), {})).toThrow(
      /Unsupported attribute "class"/,
    );
  });
});

it("checks classes at startup", () => {
  const check = (classes: unknown) => () => checkRichtextField({ classes: classes as never }, {});

  expect(
    check([
      { name: "lead", on: "block" },
      { name: "lead", on: "text" },
    ]),
  ).not.toThrow();
  expect(
    check([
      { name: "lead", on: "block" },
      { name: "lead", on: "block" },
    ]),
  ).toThrow(/duplicate rich text class "lead"/);
  expect(check([{ name: " lead", on: "block" }])).toThrow(/invalid rich text class/);
  expect(check([{ name: "lead", on: "span" }])).toThrow(/needs `on: 'block'`/);
});

describe("pruneRichtext", () => {
  it("drops marks and attributes the schema lacks and keeps the text", () => {
    const value = doc([
      {
        type: "paragraph",
        attrs: { textAlign: "center" },
        content: [
          {
            type: "text",
            text: "Hello",
            marks: [{ type: "bold" }, { type: "textStyle", attrs: { color: "red" } }],
          },
        ],
      },
    ]);
    const { value: pruned, dropped } = pruneRichtext(value as RichtextDocument, richtextSchema({}));

    expect(pruned).toEqual(doc([paragraph([{ type: "bold" }])]));
    expect(dropped.sort()).toEqual(["textAlign", "textStyle"]);
    expect(value.content[0]).toMatchObject({ attrs: { textAlign: "center" } });
  });

  it("keeps unknown nodes, so the content check still locks the editor", () => {
    const value = doc([{ type: "table", content: [] }]);

    expect(pruneRichtext(value as RichtextDocument, richtextSchema({})).value).toEqual(value);
  });
});
