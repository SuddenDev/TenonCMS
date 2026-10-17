import { describe, expect, it } from "vitest";
import { type Fields } from "../index.ts";
import { dataSchema } from "./build-data-schema.ts";

describe("dataSchema", () => {
  it("validates UTC datetime strings and keeps date-only fields strict", () => {
    const s = dataSchema({ start: { type: "datetime", required: true }, day: { type: "date" } });
    expect(s.parse({ start: "2026-10-17T12:34:56.000Z", day: "2026-10-17" })).toEqual({
      start: "2026-10-17T12:34:56.000Z",
      day: "2026-10-17",
    });
    for (const start of [
      undefined,
      null,
      "",
      "2026-10-17",
      "2026-10-17T12:34:56",
      "2026-02-30T12:00:00Z",
      42,
    ])
      expect(s.safeParse({ start }).success, String(start)).toBe(false);
    expect(
      s.safeParse({ start: "2026-10-17T12:34:56Z", day: "2026-10-17T12:34:56Z" }).success,
    ).toBe(false);
    expect(dataSchema({ start: { type: "datetime" } }).safeParse({ start: null }).success).toBe(
      true,
    );
  });

  const schema = dataSchema({
    title: { type: "text", required: true },
    body: { type: "textarea" },
    views: { type: "number" },
    featured: { type: "boolean" },
    publishedAt: { type: "date" },
    status: { type: "select", options: ["draft", "published"] },
  });

  it("accepts valid data and strips unknown keys", () => {
    expect(
      schema.parse({
        title: "Hi",
        views: 3,
        featured: true,
        publishedAt: "2026-09-23",
        status: "draft",
        extra: 1,
      }),
    ).toEqual({
      title: "Hi",
      views: 3,
      featured: true,
      publishedAt: "2026-09-23",
      status: "draft",
    });
  });

  it("allows optional fields to be missing or null", () => {
    expect(schema.safeParse({ title: "Hi", body: null, views: null }).success).toBe(true);
  });

  it("rejects a missing or empty required text", () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ title: "" }).success).toBe(false);
  });

  it("checks length, pattern and range, but not empty optional values", () => {
    const s = dataSchema({
      slug: { type: "text", minLength: 2, maxLength: 4, pattern: "[a-z]+" },
      n: { type: "number", min: 1, max: 3 },
      body: { type: "textarea", minLength: 5 },
      title: { type: "text", required: true, minLength: 3 },
    });
    expect(s.safeParse({ slug: "abc", n: 2, title: "abc" }).success).toBe(true);
    expect(s.safeParse({ slug: "", n: null, body: "", title: "abc" }).success).toBe(true);
    for (const bad of [
      { slug: "a" },
      { slug: "abcde" },
      { slug: "ab1" },
      { slug: "xab!" },
      { n: 0 },
      { n: 4 },
      { body: "abc" },
      { title: "ab" },
    ])
      expect(s.safeParse({ title: "abc", ...bad }).success, JSON.stringify(bad)).toBe(false);
    expect(s.safeParse({ title: "" }).success).toBe(false);
  });

  it("matches the whole value", () => {
    expect(dataSchema({ x: { type: "text", pattern: "a|b" } }).safeParse({ x: "ab" }).success).toBe(
      false,
    );
  });

  it("rejects an invalid pattern", () => {
    expect(() => dataSchema({ x: { type: "text", pattern: "(" } })).toThrow();
  });

  it("skips required and checks for fields whose condition is false, but keeps type checks", () => {
    const fields = {
      mediaType: { type: "select", options: ["image", "youtube"] },
      url: {
        type: "text",
        required: true,
        pattern: "https://.+",
        condition: { mediaType: "youtube" },
      },
      settings: {
        type: "group",
        fields: {
          mode: { type: "text" },
          extra: { type: "text", required: true, condition: { "/mediaType": "youtube" } },
          local: { type: "text", required: true, condition: { mode: "x" } },
        },
      },
      off: {
        type: "group",
        required: true,
        condition: { mediaType: "youtube" },
        fields: { a: { type: "number", required: true } },
      },
    } as const satisfies Fields;
    const parse = (d: object) => dataSchema(fields, d).safeParse(d);
    expect(parse({ mediaType: "image", settings: {} }).success).toBe(true);
    expect(parse({ mediaType: "image", url: "nope", settings: {} })).toMatchObject({
      success: true,
      data: { url: "nope" },
    });
    expect(parse({ mediaType: "image", url: 5 }).success).toBe(false);
    expect(parse({ mediaType: "image", off: { a: "x" } }).success).toBe(false);
    expect(parse({ mediaType: "image", off: {} }).success).toBe(true);
    expect(parse({ mediaType: "image", settings: { mode: "x" } }).success).toBe(false);
    expect(
      parse({ mediaType: "youtube", url: "nope", settings: { extra: "x" }, off: { a: 1 } }).success,
    ).toBe(false);
    expect(
      parse({ mediaType: "youtube", url: "https://y.t", settings: {}, off: { a: 1 } }).success,
    ).toBe(false);
    expect(
      parse({ mediaType: "youtube", url: "https://y.t", settings: { extra: "x" }, off: { a: 1 } })
        .success,
    ).toBe(true);
  });

  it("rejects values of the wrong type", () => {
    expect(schema.safeParse({ title: "Hi", views: "3" }).success).toBe(false);
    expect(schema.safeParse({ title: "Hi", featured: "true" }).success).toBe(false);
    expect(schema.safeParse({ title: "Hi", publishedAt: "23.09.2026" }).success).toBe(false);
    expect(schema.safeParse({ title: "Hi", status: "archived" }).success).toBe(false);
  });
});

describe("group", () => {
  const schema = dataSchema({
    seo: {
      type: "group",
      fields: {
        title: { type: "text", required: true },
        meta: { type: "group", fields: { robots: { type: "text" } } },
      },
    },
    address: { type: "group", required: true, fields: { city: { type: "text" } } },
  });

  it("validates nested data and strips unknown keys at every depth", () => {
    expect(
      schema.parse({
        seo: { title: "T", x: 1, meta: { robots: "noindex", y: 2 } },
        address: { city: "B", z: 3 },
      }),
    ).toEqual({
      seo: { title: "T", meta: { robots: "noindex" } },
      address: { city: "B" },
    });
  });

  it("allows an optional group to be missing or null and skips its required fields then", () => {
    expect(schema.safeParse({ address: {} }).success).toBe(true);
    expect(schema.safeParse({ seo: null, address: {} }).success).toBe(true);
  });

  it("requires a required group", () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ address: null }).success).toBe(false);
  });

  it("checks required and typed fields inside a present group", () => {
    expect(schema.safeParse({ seo: {}, address: {} }).success).toBe(false);
    expect(
      schema.safeParse({ seo: { title: "T", meta: { robots: 1 } }, address: {} }).success,
    ).toBe(false);
  });
});

describe("slug", () => {
  const required = dataSchema({ slug: { type: "slug", from: "title", required: true } });
  const optional = dataSchema({ slug: { type: "slug", from: "title" } });

  it("matches the pattern", () => {
    for (const s of [required, optional]) {
      for (const ok of ["a", "about-us", "v2"])
        expect(s.safeParse({ slug: ok }).success, ok).toBe(true);
      for (const bad of ["Not Valid", "a--b", "-a", "a-"])
        expect(s.safeParse({ slug: bad }).success, bad).toBe(false);
    }
  });

  it("follows required like other fields", () => {
    for (const bad of [{}, { slug: null }, { slug: "" }])
      expect(required.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    for (const ok of [{}, { slug: null }, { slug: "" }])
      expect(optional.safeParse(ok).success, JSON.stringify(ok)).toBe(true);
  });
});

describe("array", () => {
  const fields = {
    links: {
      type: "array",
      fields: {
        label: { type: "text", required: true },
        url: { type: "text" },
      },
    },
  } as const satisfies Fields;
  const parse = (f: Fields, d: object, active = true) => dataSchema(f, d, d, active).safeParse(d);
  const paths = (r: ReturnType<typeof parse>) =>
    r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));

  it("fills missing ids and keeps given ones", () => {
    const r = parse(fields, { links: [{ label: "a" }, { id: "x", label: "b" }] });
    expect(r.success).toBe(true);
    const links = r.data!.links as { id: string }[];
    expect(links[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(links[1]).toEqual({ id: "x", label: "b" });
  });

  it("strips unknown keys in items", () => {
    expect(parse(fields, { links: [{ id: "x", label: "a", extra: 1 }] }).data).toEqual({
      links: [{ id: "x", label: "a" }],
    });
  });

  it("reports item errors at their position", () => {
    const r = parse(fields, { links: [{ label: "a" }, { label: "b" }, { label: 5 }] });
    expect(Object.keys(paths(r))).toEqual(["links.2.label"]);
  });

  it("rejects a value that is not an array or an item that is not an object", () => {
    expect(parse(fields, { links: "a" }).success).toBe(false);
    expect(parse(fields, { links: { label: "a" } }).success).toBe(false);
    expect(Object.keys(paths(parse(fields, { links: [{ label: "a" }, "b"] })))).toEqual([
      "links.1",
    ]);
  });

  it("rejects an empty id", () => {
    expect(parse(fields, { links: [{ id: "", label: "a" }] }).success).toBe(false);
  });

  it("rejects duplicate ids at the list path", () => {
    const r = parse(fields, {
      links: [
        { id: "x", label: "a" },
        { id: "x", label: "b" },
      ],
    });
    expect(paths(r)).toEqual({ links: "Duplicate id" });
  });

  it("checks required, minRows and maxRows when the field applies", () => {
    const f = {
      mode: { type: "text" },
      required: { type: "array", required: true, fields: { a: { type: "text" } } },
      ranged: {
        type: "array",
        minRows: 2,
        maxRows: 3,
        condition: { mode: "on" },
        fields: { a: { type: "text" } },
      },
    } as const satisfies Fields;
    const items = (n: number) => Array.from({ length: n }, () => ({}));
    expect(parse(f, { mode: "on", required: [] }).success).toBe(false);
    expect(parse(f, { mode: "on" }).success).toBe(false);
    expect(parse(f, { mode: "on", required: items(1) }).success).toBe(true);
    expect(parse(f, { mode: "on", required: items(1), ranged: items(1) }).success).toBe(false);
    expect(parse(f, { mode: "on", required: items(1), ranged: items(2) }).success).toBe(true);
    expect(parse(f, { mode: "on", required: items(1), ranged: items(4) }).success).toBe(false);
    expect(parse(f, { mode: "off", required: items(1), ranged: items(4) }).success).toBe(true);
    expect(parse(f, { mode: "off", required: items(1), ranged: [{ a: 1 }] }).success).toBe(false);
  });

  it("skips required fields inside items when the array does not apply", () => {
    const f = {
      mode: { type: "text" },
      links: { ...fields.links, condition: { mode: "on" } },
    } as const satisfies Fields;
    expect(parse(f, { mode: "off", links: [{}] }).success).toBe(true);
    expect(parse(f, { mode: "on", links: [{}] }).success).toBe(false);
  });

  it("reads the item in conditions and the root with `/`", () => {
    const f = {
      mode: { type: "text" },
      items: {
        type: "array",
        fields: {
          kind: { type: "text" },
          url: { type: "text", required: true, condition: { kind: "link" } },
          note: { type: "text", required: true, condition: { "/mode": "strict" } },
        },
      },
    } as const satisfies Fields;
    expect(parse(f, { items: [{ kind: "text" }] }).success).toBe(true);
    expect(paths(parse(f, { items: [{ kind: "text" }, { kind: "link" }] }))).toHaveProperty([
      "items.1.url",
    ]);
    expect(Object.keys(paths(parse(f, { mode: "strict", items: [{ kind: "text" }] })))).toEqual([
      "items.0.note",
    ]);
  });

  it("fills ids in a loose parse and checks only types", () => {
    const r = parse(fields, { links: [{}] }, false);
    expect(r.success).toBe(true);
    expect((r.data!.links as { id: string }[])[0].id).toBeTypeOf("string");
    expect(parse(fields, { links: [{ label: 1 }] }, false).success).toBe(false);
  });

  it("nests in arrays and groups", () => {
    const f = {
      menu: {
        type: "group",
        fields: {
          sections: {
            type: "array",
            fields: { links: fields.links },
          },
        },
      },
    } as const satisfies Fields;
    const r = parse(f, { menu: { sections: [{ links: [{ label: "a" }] }, { links: [{}] }] } });
    expect(Object.keys(paths(r))).toEqual(["menu.sections.1.links.0.label"]);
    const ok = parse(f, { menu: { sections: [{ links: [{ label: "a" }] }] } });
    expect(ok.success).toBe(true);
    const section = (ok.data!.menu as { sections: { id: string; links: { id: string }[] }[] })
      .sections[0];
    expect(section.id).toBeTypeOf("string");
    expect(section.links[0].id).toBeTypeOf("string");
  });
});

describe("blocks", () => {
  const fields = {
    content: {
      type: "blocks",
      maxRows: 2,
      blocks: {
        hero: { fields: { title: { type: "text", required: true } } },
        text: {
          fields: {
            kind: { type: "text" },
            body: { type: "text", required: true, condition: { kind: "long" } },
          },
        },
      },
    },
  } as const satisfies Fields;
  const parse = (f: Fields, d: object, active = true) => dataSchema(f, d, d, active).safeParse(d);
  const paths = (r: ReturnType<typeof parse>) =>
    r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));

  it("keeps each item's block fields, fills ids and strips unknown keys", () => {
    const r = parse(fields, {
      content: [
        { blockType: "hero", title: "Hi", body: "x" },
        { id: "t", blockType: "text", body: "b", extra: 1 },
      ],
    });
    expect(r.success).toBe(true);
    const [hero, text] = r.data!.content as { id: string }[];
    expect(hero).toEqual({ id: expect.any(String), blockType: "hero", title: "Hi" });
    expect(text).toEqual({ id: "t", blockType: "text", body: "b" });
  });

  it("fails an unknown or missing block type at the item's blockType", () => {
    expect(paths(parse(fields, { content: [{ blockType: "hero", title: "a" }, {}] }))).toEqual({
      "content.1.blockType": "Unknown block",
    });
    expect(paths(parse(fields, { content: [{ blockType: "nope" }] }))).toEqual({
      "content.0.blockType": "Unknown block",
    });
    expect(paths(parse(fields, { content: [{ blockType: "toString" }] }))).toEqual({
      "content.0.blockType": "Unknown block",
    });
  });

  it("reports item errors at their position and reads the item in conditions", () => {
    const r = parse(fields, {
      content: [
        { blockType: "text", kind: "long" },
        { blockType: "hero", title: 5 },
      ],
    });
    expect(Object.keys(paths(r)).sort()).toEqual(["content.0.body", "content.1.title"]);
    expect(parse(fields, { content: [{ blockType: "text" }] }).success).toBe(true);
  });

  it("checks row limits and duplicate ids", () => {
    const hero = { blockType: "hero", title: "a" };
    expect(paths(parse(fields, { content: [hero, hero, hero] }))).toEqual({
      content: "At most 2 items",
    });
    expect(
      paths(
        parse(fields, {
          content: [
            { ...hero, id: "x" },
            { ...hero, id: "x" },
          ],
        }),
      ),
    ).toEqual({ content: "Duplicate id" });
  });

  it("checks only types in a loose parse", () => {
    const r = parse(fields, { content: [{ blockType: "hero" }] }, false);
    expect(r.success).toBe(true);
    expect(parse(fields, { content: [{ blockType: "nope" }] }, false).success).toBe(false);
  });
});

describe("select", () => {
  it("takes the values of labeled options", () => {
    const s = dataSchema({
      size: { type: "select", options: [{ value: "s", label: { en: "Small" } }, "m"] },
    });
    expect(s.safeParse({ size: "s" }).success).toBe(true);
    expect(s.safeParse({ size: "m" }).success).toBe(true);
    expect(s.safeParse({ size: "Small" }).success).toBe(false);
  });

  it("stores an array of distinct options with many", () => {
    const s = dataSchema({
      tags: { type: "select", many: true, options: ["a", "b"] },
      cats: { type: "select", many: true, required: true, options: ["a", "b"] },
    });
    expect(s.safeParse({ tags: [], cats: ["a"] }).success).toBe(true);
    expect(s.safeParse({ tags: ["a", "b"], cats: ["b"] }).success).toBe(true);
    for (const bad of [{ tags: "a" }, { tags: ["c"] }, { tags: ["a", "a"] }, { cats: [] }])
      expect(s.safeParse({ cats: ["a"], ...bad }).success, JSON.stringify(bad)).toBe(false);
  });

  it("skips required of an inactive many select", () => {
    const fields = {
      on: { type: "boolean" },
      tags: { type: "select", many: true, required: true, options: ["a"], condition: { on: true } },
    } as const satisfies Fields;
    expect(dataSchema(fields, { on: false }).safeParse({ on: false, tags: [] }).success).toBe(true);
    expect(dataSchema(fields, { on: false }).safeParse({ on: false, tags: ["x"] }).success).toBe(
      false,
    );
  });
});

describe("number step", () => {
  it("accepts multiples of step counted from min", () => {
    const s = dataSchema({
      half: { type: "number", step: 0.5 },
      odd: { type: "number", min: 1, step: 2 },
      cents: { type: "number", step: 0.01 },
    });
    expect(s.safeParse({ half: 1.5, odd: 5, cents: 0.3 }).success).toBe(true);
    for (const bad of [{ half: 1.2 }, { odd: 4 }, { cents: 0.305 }])
      expect(s.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});
