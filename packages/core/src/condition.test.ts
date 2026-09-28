import { describe, expect, it } from "vitest";
import { createClient } from "./client.ts";
import { matchCondition } from "./condition.ts";
import { defineCms } from "./index.ts";
import { page } from "./presets/index.ts";
import {
  type Collection,
  type Data,
  defineCollection,
  defineGlobal,
  type Doc,
  type Fields,
} from "./schema.ts";
import { dataSchema } from "./validate.ts";
describe("matchCondition", () => {
  const d = { type: "video", price: 5, tag: "", date: "2026-09-24" };
  it.each([
    [{ type: "video" }, true],
    [{ type: { eq: "image" } }, false],
    [{ type: { ne: "image" } }, true],
    [{ type: { in: ["video", "youtube"] } }, true],
    [{ type: { notIn: ["video"] } }, false],
    [{ price: { gt: 5 } }, false],
    [{ price: { gte: 5 } }, true],
    [{ price: { lt: 10, gt: 0 } }, true],
    [{ date: { lte: "2026-12-31" } }, true],
    [{ price: { gt: "1" } }, false],
    [{ missing: { gt: 0 } }, false],
    [{ tag: { exists: false } }, true],
    [{ type: { exists: true } }, true],
    [{ missing: null }, true],
    [{ type: "video", price: 6 }, false],
  ])("supports every operator: %j → %s", (c, expected) =>
    expect(matchCondition(c, d)).toBe(expected),
  );

  it("nests $every and $some", () => {
    const c = { $some: [{ type: "video" }, { $every: [{ type: "image" }, { price: { gt: 0 } }] }] };
    expect(matchCondition(c, { type: "video" })).toBe(true);
    expect(matchCondition(c, { type: "image", price: 1 })).toBe(true);
    expect(matchCondition(c, { type: "image", price: 0 })).toBe(false);
    expect(matchCondition({ $every: [] }, {})).toBe(true);
    expect(matchCondition({ $some: [] }, {})).toBe(false);
  });

  it("reads siblings inside a group and root paths with /", () => {
    const data = { mode: "advanced", settings: { mode: "simple", color: "red" } };
    expect(matchCondition({ mode: "simple" }, data, data.settings)).toBe(true);
    expect(matchCondition({ "/mode": "advanced" }, data, data.settings)).toBe(true);
    expect(matchCondition({ "/settings.color": "red" }, data, data.settings)).toBe(true);
  });
});
