import { describe, expect, it } from "vitest";
import { createClient } from "../../client/index.ts";
import { matchCondition } from "../condition.ts";
import { defineCms } from "../../index.ts";
import { page } from "../../presets/index.ts";
import {
  type Collection,
  type Data,
  defineCollection,
  defineGlobal,
  type Doc,
  type Fields,
} from "../index.ts";
import { dataSchema } from "./build-data-schema.ts";
describe("defineCms checks", () => {
  const define =
    (collections: Record<string, Collection>, globals: Record<string, { fields: Fields }> = {}) =>
    () =>
      defineCms({ collections, globals, database: { url: ":memory:" }, secret: "x".repeat(32) });
  const g = { type: "group", fields: { t: { type: "text" } } } as const;

  it("throws for a condition on an unknown field", () => {
    expect(define({ c: { fields: { a: { type: "text", condition: { nope: 1 } } } } })).toThrow(
      /"c.a" names unknown field "nope"/,
    );
    expect(
      define({ c: { fields: { g, a: { type: "text", condition: { "/g.nope": 1 } } } } }),
    ).toThrow(/unknown field "\/g.nope"/);
    expect(
      define({
        c: { fields: { a: { type: "text", condition: { $some: [{ $every: [{ nope: 1 }] }] } } } },
      }),
    ).toThrow(/unknown field "nope"/);
    const root = {
      x: { type: "text" },
      g: { type: "group", fields: { a: { type: "text", condition: { x: 1 } } } },
    } as const;
    expect(define({ c: { fields: root } })).toThrow(/"c.g.a" names unknown field "x"/);
    expect(define({}, { s: { fields: { a: { type: "text", condition: { nope: 1 } } } } })).toThrow(
      /unknown field "nope"/,
    );
  });

  it("accepts conditions on siblings, root paths and group paths", () => {
    const fields = {
      x: { type: "text" },
      g,
      a: { type: "text", condition: { x: 1, "g.t": "y", $some: [{ "/g.t": "z" }] } },
      h: {
        type: "group",
        fields: { t: { type: "text" }, b: { type: "text", condition: { t: 1, "/x": 2 } } },
      },
    } as const;
    expect(define({ c: { fields } })).not.toThrow();
  });

  it("throws for unique inside a group, in a global, on boolean, custom, group, join and many relations", () => {
    const bad = [
      { g: { type: "group", fields: { t: { type: "text", unique: true } } } },
      { g: { type: "group", fields: { s: { type: "slug", unique: true } } } },
      { b: { type: "boolean", unique: true } },
      { c: { type: "custom:color", unique: true } },
      { g: { type: "group", unique: true, fields: {} } },
      {
        j: { type: "join", collection: "c", on: "r", unique: true },
        r: { type: "relation", collection: "c" },
      },
      { r: { type: "relation", collection: "c", many: true, unique: true } },
    ] as Fields[];
    for (const fields of bad)
      expect(define({ c: { fields } }), JSON.stringify(fields)).toThrow(/cannot be unique/);
    expect(define({}, { s: { fields: { t: { type: "text", unique: true } } } })).toThrow(
      /"s.t" cannot be unique/,
    );
  });

  it("accepts unique on top-level text, textarea, number, date, select, slug and single relation fields", () => {
    const fields: Fields = {
      a: { type: "text", unique: true },
      b: { type: "textarea", unique: true },
      c: { type: "number", unique: true },
      d: { type: "date", unique: true },
      e: { type: "select", options: ["x"], unique: true },
      f: { type: "relation", collection: "c", unique: true },
      g: { type: "slug", from: "a", unique: true },
    };
    expect(define({ c: { fields } })).not.toThrow();
  });

  it("throws for an invalid pattern, also under a condition", () => {
    expect(define({ c: { fields: { a: { type: "text", pattern: "(" } } } })).toThrow();
    expect(
      define({
        c: {
          fields: { x: { type: "text" }, a: { type: "text", pattern: "(", condition: { x: "y" } } },
        },
      }),
    ).toThrow();
  });
});
