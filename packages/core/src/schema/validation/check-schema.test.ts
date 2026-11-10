import { describe, expect, it } from "vitest";
import { defineCms } from "../../index.ts";
import { type Collection, type Fields } from "../index.ts";
import { checkSchema } from "./check-schema.ts";
import { libsql } from "../../integrations/libsql/index.ts";

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
        database: libsql(":memory:"),
        secret: "x".repeat(32),
      });
  const g = { type: "group", fields: { t: { type: "text" } } } as const;

  it("rejects a description function without the client build transform", () => {
    expect(
      define({ c: { fields: { price: { type: "number", description: () => "Price" } } } }),
    ).toThrow(/c.price.description.*\.client/);
  });

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
      { s: { type: "select", options: ["a"], many: true, unique: true } },
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

  it("throws for empty or repeated select options", () => {
    expect(define({ c: { fields: { s: { type: "select", options: [] } } } })).toThrow(
      /select "c.s" has no options/,
    );
    expect(
      define({
        c: { fields: { s: { type: "select", options: ["a", { value: "a", label: "A" }] } } },
      }),
    ).toThrow(/select "c.s" repeats option "a"/);
  });

  it("throws for a slider without min and max and for a step that is not positive", () => {
    expect(
      define({ c: { fields: { n: { type: "number", appearance: "slider", min: 0 } } } }),
    ).toThrow(/slider "c.n" needs min and max/);
    expect(define({ c: { fields: { n: { type: "number", step: 0 } } } })).toThrow(
      /number "c.n" needs a positive step/,
    );
    expect(
      define({ c: { fields: { n: { type: "number", appearance: "slider", min: 0, max: 9 } } } }),
    ).not.toThrow();
  });

  it("throws for size units that are empty or repeated and for a step that is not positive", () => {
    expect(define({ c: { fields: { s: { type: "size", units: [] } } } })).toThrow(
      /size "c.s" has no units/,
    );
    expect(define({ c: { fields: { s: { type: "size", units: ["px", "px"] } } } })).toThrow(
      /size "c.s" repeats unit "px"/,
    );
    expect(define({ c: { fields: { s: { type: "size", units: ["px"], step: 0 } } } })).toThrow(
      /size "c.s" needs a positive step/,
    );
  });

  describe("layout", () => {
    const tabs = { main: {}, seo: {} };
    const fieldsets = { meta: {} };

    it("accepts tabs and fieldsets named by the nearest owner", () => {
      const fields = {
        a: { type: "text", tab: "main", fieldset: "meta", width: "1/2" },
        b: { type: "text", tab: "main", fieldset: "meta" },
        c: { type: "text", tab: ["main", "seo"] },
        g: {
          type: "group",
          tab: "seo",
          tabs: { x: {} },
          fieldsets,
          fields: { t: { type: "text", tab: "x", fieldset: "meta" } },
        },
        l: { type: "array", tabs: { x: {} }, fields: { t: { type: "text", tab: "x" } } },
        k: {
          type: "blocks",
          blocks: { hero: { fieldsets, fields: { t: { type: "text", fieldset: "meta" } } } },
        },
      } as const satisfies Fields;
      expect(define({ c: { tabs, fieldsets, fields } })).not.toThrow();
      expect(
        define({}, { s: { tabs, fields: { a: { type: "text", tab: "main" } } } as never }),
      ).not.toThrow();
    });

    it("throws for a tab or fieldset the nearest owner does not have", () => {
      const bad: [Record<string, unknown>, RegExp][] = [
        [{ fields: { a: { type: "text", tab: "nope" } } }, /field "c.a" names unknown tab "nope"/],
        [{ tabs, fields: { a: { type: "text", tab: ["main", "nope"] } } }, /unknown tab "nope"/],
        [
          { fields: { a: { type: "text", fieldset: "nope" } } },
          /field "c.a" names unknown fieldset "nope"/,
        ],
        [
          { tabs, fields: { g: { type: "group", fields: { t: { type: "text", tab: "main" } } } } },
          /field "c.g.t" names unknown tab "main"/,
        ],
        [
          { fields: { l: { type: "array", fields: { t: { type: "text", fieldset: "x" } } } } },
          /field "c.l.t" names unknown fieldset "x"/,
        ],
        [
          {
            fields: {
              k: {
                type: "blocks",
                blocks: { hero: { fields: { t: { type: "text", tab: "x" } } } },
              },
            },
          },
          /field "c.k.hero.t" names unknown tab "x"/,
        ],
      ];
      for (const [c, message] of bad) expect(define({ c } as never)).toThrow(message);
    });

    it("throws for a fieldset whose fields sit in different tabs", () => {
      const fields = {
        a: { type: "text", tab: "main", fieldset: "meta" },
        b: { type: "text", tab: "seo", fieldset: "meta" },
      } as const satisfies Fields;
      expect(define({ c: { tabs, fieldsets, fields } })).toThrow(
        /fieldset "c.meta" holds fields of different tabs/,
      );
    });
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

  describe("array", () => {
    const array = (fields: Fields, extra: object = {}) =>
      ({ type: "array", fields, ...extra }) as const;

    it("accepts groups, nested arrays and sibling conditions inside items", () => {
      const fields = {
        x: { type: "text" },
        links: array({
          label: { type: "text" },
          url: { type: "text", condition: { label: "a", "/x": "b" } },
          g,
          sub: array({ t: { type: "text" }, u: { type: "text", condition: { t: 1 } } }),
        }),
      } as Fields;
      expect(define({ c: { fields } })).not.toThrow();
    });

    it("throws for an item field named id", () => {
      expect(define({ c: { fields: { links: array({ id: { type: "text" } }) } } })).toThrow(
        /array "c.links" cannot have an item field named "id"/,
      );
      const nested = { g: { type: "group", fields: { a: array({ id: { type: "text" } }) } } };
      expect(define({ c: { fields: nested as Fields } })).toThrow(/array "c.g.a" cannot have/);
    });

    it("throws for a join inside an item", () => {
      const fields = {
        r: { type: "relation", collection: "c" },
        links: array({ j: { type: "join", collection: "c", on: "r" } }),
      } as Fields;
      expect(define({ c: { fields } })).toThrow(/join inside array "c.links"/);
    });

    it("throws for a join on a relation inside an item", () => {
      const fields = {
        links: array({ r: { type: "relation", collection: "c" } }),
        j: { type: "join", collection: "c", on: "links.r" },
      } as Fields;
      expect(define({ c: { fields } })).toThrow(/join "c.j" needs "links.r" to be a relation/);
    });

    it("throws for bad minRows and maxRows", () => {
      const t = { t: { type: "text" } } as const;
      expect(define({ c: { fields: { a: array(t, { minRows: 3, maxRows: 2 }) } } })).toThrow(
        /array "c.a" has minRows above maxRows/,
      );
      expect(define({ c: { fields: { a: array(t, { minRows: -1 }) } } })).toThrow(
        /array "c.a" has a negative minRows/,
      );
      expect(define({ c: { fields: { a: array(t, { maxRows: -1 }) } } })).toThrow(
        /array "c.a" has a negative maxRows/,
      );
      expect(define({ c: { fields: { a: array(t, { minRows: 2, maxRows: 2 }) } } })).not.toThrow();
    });

    it("throws for a condition path that crosses an array", () => {
      const links = array({ label: { type: "text" } });
      for (const path of ["/links.label", "/links.0.label", "links.0.label"])
        expect(
          define({ c: { fields: { links, a: { type: "text", condition: { [path]: 1 } } } } }),
          path,
        ).toThrow(`condition on "c.a" names "${path}" inside an array`);
      expect(
        define({ c: { fields: { links, a: { type: "text", condition: { "/links": 1 } } } } }),
      ).not.toThrow();
    });
  });

  describe("blocks", () => {
    const blocks = (b: Record<string, Fields>, extra: object = {}) =>
      ({
        type: "blocks",
        blocks: Object.fromEntries(Object.entries(b).map(([k, fields]) => [k, { fields }])),
        ...extra,
      }) as const;

    it("throws for an empty blocks record", () => {
      expect(define({ c: { fields: { content: blocks({}) } } })).toThrow(
        /blocks "c.content" has no blocks/,
      );
    });

    it("throws for a block field named id or blockType", () => {
      for (const name of ["id", "blockType"])
        expect(
          define({ c: { fields: { content: blocks({ hero: { [name]: { type: "text" } } }) } } }),
        ).toThrow(`blocks "c.content.hero" cannot have an item field named "${name}"`);
    });

    it("throws for a join, unique and a bad condition inside a block", () => {
      const join = {
        r: { type: "relation", collection: "c" },
        content: blocks({ hero: { j: { type: "join", collection: "c", on: "r" } } }),
      } as Fields;
      expect(define({ c: { fields: join } })).toThrow(/join inside blocks "c.content"/);
      expect(
        define({
          c: { fields: { content: blocks({ hero: { t: { type: "text", unique: true } } }) } },
        }),
      ).toThrow(/"c.content.hero.t" cannot be unique/);
      const cond = { content: blocks({ hero: { t: { type: "text", condition: { nope: 1 } } } }) };
      expect(define({ c: { fields: cond as Fields } })).toThrow(
        /"c.content.hero.t" names unknown field "nope"/,
      );
    });

    it("throws for a condition path that crosses blocks", () => {
      const content = blocks({ hero: { t: { type: "text" } } });
      for (const path of ["/content.0.t", "content.0.t"])
        expect(
          define({ c: { fields: { content, a: { type: "text", condition: { [path]: 1 } } } } }),
          path,
        ).toThrow(`condition on "c.a" names "${path}" inside blocks`);
    });

    it("throws for localized on a field inside a block", () => {
      const l = { locales: ["en", "de"], defaultLocale: "en" };
      const f = { content: blocks({ hero: { t: { type: "text", localized: false } } }) };
      expect(define({ c: { fields: f as Fields, localized: true } }, {}, l)).toThrow(
        /field "c.content.hero.t" cannot set localized inside a block item/,
      );
    });
  });

  describe("localization", () => {
    const l = { locales: ["en", "de"], defaultLocale: "en" };
    const fields = { t: { type: "text" } } as const;

    it("throws for localized on a field inside an item", () => {
      const f = {
        links: { type: "array", fields: { t: { type: "text", localized: false } } },
      } as const;
      expect(define({ c: { fields: f, localized: true } }, {}, l)).toThrow(
        /field "c.links.t" cannot set localized inside an array item/,
      );
      const ok = { links: { type: "array", localized: false, fields: { t: { type: "text" } } } };
      expect(define({ c: { fields: ok as never, localized: true } }, {}, l)).not.toThrow();
    });

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
