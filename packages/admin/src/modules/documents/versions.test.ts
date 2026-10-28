import { describe, expect, it } from "vitest";
import type { Fields } from "../../../../core/src/schema";
import { changedKeys, groupByTime, timeGroup } from "./versions";

const fields = {
  title: { type: "text" },
  seo: { type: "group", fields: { title: { type: "text" } } },
  tags: { type: "array", fields: { name: { type: "text" } } },
  posts: { type: "join", collection: "posts", on: "author" },
} as unknown as Fields;

describe("changedKeys", () => {
  it("names the top-level fields whose values differ", () => {
    const before = { title: "A", seo: { title: "S" }, tags: [{ id: "1", name: "x" }] };
    const after = { title: "B", seo: { title: "S" }, tags: [{ id: "1", name: "y" }] };

    expect(changedKeys(fields, before, after)).toEqual(["title", "tags"]);
  });

  it("ignores key order, and treats missing and null alike", () => {
    expect(
      changedKeys(
        fields,
        { seo: { title: "S", x: 1 } },
        { seo: { x: 1, title: "S" }, title: null },
      ),
    ).toEqual([]);
  });

  it("skips joins", () => {
    expect(changedKeys(fields, { posts: [1] }, { posts: [2] })).toEqual([]);
  });
});

describe("timeGroup", () => {
  // A Wednesday.
  const now = new Date(2026, 9, 28, 15, 0);
  const at = (month: number, day: number, hour = 12) => new Date(2026, month, day, hour);

  it("sorts a date into calendar groups", () => {
    expect(timeGroup(at(9, 28, 0), now)).toBe("today");
    expect(timeGroup(at(9, 27, 23), now)).toBe("yesterday");
    expect(timeGroup(at(9, 26), now)).toBe("thisWeek");
    expect(timeGroup(at(9, 25), now)).toBe("thisMonth");
    expect(timeGroup(at(9, 1), now)).toBe("thisMonth");
    expect(timeGroup(at(8, 30), now)).toBe("lastMonth");
    expect(timeGroup(at(8, 1), now)).toBe("lastMonth");
    expect(timeGroup(at(7, 31), now)).toBe("older");
  });

  it("puts the start of this week before the month boundary into this week", () => {
    const monday = new Date(2026, 8, 28);
    expect(timeGroup(monday, new Date(2026, 9, 2, 9))).toBe("thisWeek");
  });

  it("counts December as last month in January", () => {
    expect(timeGroup(new Date(2025, 11, 5), new Date(2026, 0, 20))).toBe("lastMonth");
  });
});

describe("groupByTime", () => {
  it("keeps the order and starts a group where it changes", () => {
    const now = new Date(2026, 9, 28, 15, 0);
    const v = (id: string, d: Date) => ({ id, updatedAt: d.toISOString() });
    const list = [
      v("a", new Date(2026, 9, 28, 14)),
      v("b", new Date(2026, 9, 28, 9)),
      v("c", new Date(2026, 9, 27, 9)),
      v("d", new Date(2025, 1, 1)),
    ];

    expect(groupByTime(list, now).map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ["today", ["a", "b"]],
      ["yesterday", ["c"]],
      ["older", ["d"]],
    ]);
  });
});
