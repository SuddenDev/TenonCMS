import { describe, expect, it } from "vitest";
import type { Inner } from "../cms/runtime/types.ts";
import { check, enforce, matches } from "./rule.ts";

const as = (role?: string | null) =>
  ({ user: role === undefined ? null : { id: "u", role } }) as unknown as Inner;

describe("check", () => {
  it("allows a missing rule and passes booleans through", async () => {
    expect(await check(as(), undefined, {})).toBe(true);
    expect(await check(as(), false, {})).toBe(false);
  });

  it("matches signed-in users by role, a missing role as editor", async () => {
    expect(await check(as(), ["editor"], {})).toBe(false);
    expect(await check(as(null), ["editor"], {})).toBe(true);
    expect(await check(as("admin"), ["editor"], {})).toBe(false);
  });

  it("returns what a function returns", async () => {
    expect(await check(as(), ({ id }: { id: string }) => ({ owner: id }), { id: "x" })).toEqual({
      owner: "x",
    });
  });
});

describe("matches and enforce", () => {
  it("compare values, `null` with a missing one", () => {
    expect(matches({ a: 1 }, { a: 1, b: null })).toBe(true);
    expect(matches({ a: 1 }, { a: "1" })).toBe(false);
  });

  it("deny `false` with 401 or 403, and a `where` without a matching document", () => {
    expect(() => enforce(as(), false)).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => enforce(as("editor"), { a: 1 })).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => enforce(as("editor"), { a: 1 }, { a: 2 })).toThrow();
    expect(() => enforce(as("editor"), { a: 1 }, { a: 1 })).not.toThrow();
  });
});
