import { describe, expect, it } from "vitest";
import { toJson } from "./to-json.ts";

describe("toJson", () => {
  it("copies JSON values", () => {
    const value = { a: [1, "x", null, true, { b: 0.5 }], c: "s" };
    const copy = toJson(value, "result");
    expect(copy).toEqual(value);
    expect(copy).not.toBe(value);
  });

  it("accepts primitives and null-prototype objects", () => {
    for (const v of [null, true, false, "s", 0, -1.5, []]) expect(toJson(v, "result")).toEqual(v);
    expect(toJson(Object.assign(Object.create(null), { a: 1 }), "result")).toEqual({ a: 1 });
  });

  it("drops object properties that are undefined", () => {
    const copy = toJson({ a: 1, b: undefined, c: { d: undefined } }, "result");
    expect(copy).toEqual({ a: 1, c: {} });
    expect(copy).not.toHaveProperty("b");
  });

  it("keeps an own __proto__ key as data", () => {
    const copy = toJson(JSON.parse('{"__proto__":{"x":1}}'), "result") as object;
    expect(Object.keys(copy)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(({} as any).x).toBeUndefined();
  });

  it.each([
    ["undefined", undefined],
    ["a function", () => 1],
    ["a bigint", 1n],
    ["a symbol", Symbol("s")],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a Date", new Date()],
    ["a Map", new Map()],
    ["a class instance", new (class A {})()],
    ["undefined in an array", [1, undefined]],
    ["a function property", { a: () => 1 }],
    ["a sparse array", Array(2)],
  ])("rejects %s", (_name, value) => {
    expect(() => toJson(value, "result")).toThrow();
  });

  it("rejects cycles but allows a shared object", () => {
    const a: any = { x: 1 };
    a.self = a;
    expect(() => toJson(a, "result")).toThrow("cycle");
    const shared = { n: 1 };
    expect(toJson({ p: shared, q: shared }, "result")).toEqual({ p: { n: 1 }, q: { n: 1 } });
  });

  it("names the path of the bad value", () => {
    expect(() => toJson({ a: [{ b: 1n }] }, "result")).toThrow("result.a[0].b");
  });
});
