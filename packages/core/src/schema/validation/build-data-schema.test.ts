import { describe, expect, it } from "vitest";
import { type Fields } from "../index.ts";
import { dataSchema } from "./build-data-schema.ts";

describe("dataSchema", () => {
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
