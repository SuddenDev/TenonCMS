import { Node } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { clientRef } from "../../admin/config.ts";
import { mergeRichtext } from "./merge-richtext.ts";

const extension = (name: string) => ({
  schema: Node.create({ name, group: "block", content: "inline*" }),
  client: clientRef(`./${name}.ts`),
});

describe("rich text registration merge", () => {
  it("merges plugins before the host", () => {
    const merged = mergeRichtext(
      [
        { name: "a", richtext: { extensions: { one: extension("one") } } },
        { name: "b", richtext: { extensions: { two: extension("two") } } },
      ],
      { extensions: { three: extension("three") } },
    );
    expect(Object.keys(merged)).toEqual(["one", "two", "three"]);
    expect(merged.two?.client).toEqual({ clientRef: "./two.ts" });
  });

  it("rejects a name used twice", () => {
    expect(() =>
      mergeRichtext([{ name: "a", richtext: { extensions: { one: extension("one") } } }], {
        extensions: { one: extension("one") },
      }),
    ).toThrow('duplicate rich text feature "one"');
  });

  it("rejects a built-in feature name", () => {
    expect(() => mergeRichtext([], { extensions: { bold: extension("bold") } })).toThrow(
      'duplicate rich text feature "bold"',
    );
  });

  it("requires a clientRef() and a schema", () => {
    expect(() =>
      mergeRichtext([], { extensions: { one: { ...extension("one"), client: "./x" as never } } }),
    ).toThrow("richtext.extensions.one.client in tenon.config.ts MUST use clientRef()");
    expect(() =>
      mergeRichtext([], {
        extensions: { one: { ...extension("one"), schema: undefined as never } },
      }),
    ).toThrow('rich text feature "one" needs a schema');
  });

  it("does not look up registrations through the prototype", () => {
    expect(mergeRichtext([], {}).constructor).toBeUndefined();
  });
});
