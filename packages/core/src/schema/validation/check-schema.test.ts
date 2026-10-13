import { describe, expect, it } from "vitest";
import { defineCms } from "../../index.ts";
import { type Collection, type Fields } from "../index.ts";
import { checkSchema } from "./check-schema.ts";

const normalized = (l: { locales: string[]; defaultLocale: string }) => ({
  ...l,
  fallback: true,
  routing: { prefix: "except-default" as const },
});

describe("defineCms checks", () => {
  const define =
    (
      collections: Record<string, Collection>,
      globals: Record<string, { fields: Fields; permalink?: string; localized?: boolean }> = {},
      localization?: { locales: string[]; defaultLocale: string },
    ) =>
    () =>
      defineCms({
        collections,
        globals,
        localization: localization as never,
        database: { url: ":memory:" },
        secret: "x".repeat(32),
      });
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

  it("throws for a permalink placeholder that names no stored field", () => {
    const fields = { slug: { type: "text" } } as const;
    expect(define({ c: { fields, permalink: "/{slug}" } })).not.toThrow();
    expect(define({ c: { fields, permalink: "/{nope}" } })).toThrow(
      /permalink of "c" names unknown field "nope"/,
    );
    expect(define({}, { s: { fields, permalink: "/{nope}" } })).toThrow(
      /permalink of "s" names unknown field "nope"/,
    );
  });

  describe("localization", () => {
    const l = { locales: ["en", "de"], defaultLocale: "en" };
    const fields = { t: { type: "text" } } as const;

    it("throws for localized without the localization option", () => {
      expect(define({ c: { fields, localized: true } })).toThrow(
        /"c" is localized but the `localization` option is missing/,
      );
      expect(define({}, { s: { fields, localized: true } })).toThrow(
        /"s" is localized but the `localization` option is missing/,
      );
      expect(define({ c: { fields, localized: true } }, {}, l)).not.toThrow();
    });

    it("throws for a localized field outside a localized collection or global", () => {
      const f = { t: { type: "text", localized: false } } as const;
      expect(define({ c: { fields: f } }, {}, l)).toThrow(
        /field "c.t" sets localized outside a localized collection or global/,
      );
      expect(define({}, { s: { fields: f } }, l)).toThrow(/field "s.t" sets localized/);
      expect(define({ c: { fields: f, localized: true } }, {}, l)).not.toThrow();
    });

    it("throws for localized on a child of a group", () => {
      const f = {
        g: { type: "group", fields: { t: { type: "text", localized: false } } },
      } as const;
      expect(define({ c: { fields: f, localized: true } }, {}, l)).toThrow(
        /field "c.g.t" cannot set localized inside a group/,
      );
      const ok = { g: { type: "group", localized: false, fields: { t: { type: "text" } } } };
      expect(define({ c: { fields: ok as never, localized: true } }, {}, l)).not.toThrow();
    });

    it("throws for a localized media collection", () => {
      const schema = { collections: { media: { fields, localized: true } } };
      expect(() => checkSchema(schema, { depth: 2, maxDepth: 5 }, normalized(l))).toThrow(
        /"media" cannot be localized/,
      );
    });

    it("accepts a {locale} placeholder only without routing", () => {
      const schema = {
        collections: { c: { fields, localized: true, permalink: "/{locale}/{t}" } },
      };
      const check = (routing: object | false) => () =>
        checkSchema(schema, { depth: 2, maxDepth: 5 }, { ...normalized(l), routing } as never);
      expect(check(false)).not.toThrow();
      expect(check({ prefix: "always" })).toThrow(/permalink of "c" names unknown field "locale"/);
    });

    it("throws for a bad locales list", () => {
      expect(define({}, {}, { locales: ["en"], defaultLocale: "de" })).toThrow(
        /defaultLocale "de" is not in locales/,
      );
      expect(define({}, {}, { locales: [], defaultLocale: "en" })).toThrow(
        /localization.locales MUST NOT be empty/,
      );
      expect(define({}, {}, { locales: ["en", "de", "en"], defaultLocale: "en" })).toThrow(
        /duplicate locale "en"/,
      );
    });
  });
});
