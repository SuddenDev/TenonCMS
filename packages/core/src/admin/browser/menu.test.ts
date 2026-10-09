import { describe, expect, it } from "vitest";
import { groupMenu } from "./menu.ts";

const item = (label: string, order: number, group?: string) => ({ label, order, group });

describe("groupMenu", () => {
  it("puts items without a group into Content", () => {
    expect(groupMenu([item("a", 10), item("b", 20)])).toEqual([
      { label: "Content", items: [item("a", 10), item("b", 20)] },
    ]);
  });

  it("puts items without a group into the given fallback", () => {
    expect(groupMenu([item("a", 10), item("b", 20, "Tools")], "Site")).toEqual([
      { label: "Site", items: [item("a", 10)] },
      { label: "Tools", items: [item("b", 20, "Tools")] },
    ]);
  });

  it("orders groups by their first item and items by order", () => {
    const groups = groupMenu([
      item("tools", 30, "Tools"),
      item("post", 10),
      item("nav", 20, "Tools"),
      item("home", 5, "Site"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Site", "Content", "Tools"]);
    expect(groups[2]!.items.map((i) => i.label)).toEqual(["nav", "tools"]);
  });

  it("keeps the definition order on equal orders", () => {
    const [group] = groupMenu([item("b", 1), item("a", 1)]);
    expect(group!.items.map((i) => i.label)).toEqual(["b", "a"]);
  });

  it("returns no groups for no items", () => {
    expect(groupMenu([])).toEqual([]);
  });
});
