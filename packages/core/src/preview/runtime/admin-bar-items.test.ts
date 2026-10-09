import { describe, expect, it } from "vitest";
import { builtIns, composeItems } from "./admin-bar-items.ts";

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("builtIns", () => {
  it("lists the stubs of a site page", () => {
    expect(builtIns("site")).toEqual([
      { id: "dashboard", order: 10, label: "Dashboard", builtIn: true },
      { id: "edit", order: 20, label: "Edit", icon: "pencil", builtIn: true },
      { id: "perspective", order: 30, label: "Drafts", builtIn: true },
    ]);
  });

  it("lists only the editor link and overlay switch in a preview tab", () => {
    expect(builtIns("preview-tab")).toEqual([
      { id: "edit", order: 10, label: "Back to visual editor", icon: "arrow-left", builtIn: true },
      { id: "live-edit", order: 20, label: "Edit preview", builtIn: true },
    ]);
  });
});

describe("composeItems", () => {
  it("replaces an earlier item with the same id in place", () => {
    const items = composeItems(
      [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      [{ id: "a", label: "A2" }],
    );
    expect(items).toEqual([
      { id: "a", label: "A2" },
      { id: "b", label: "B" },
    ]);
  });

  it("sorts by order, ties and unordered items in insertion order, unordered last", () => {
    const items = composeItems(
      [
        { id: "x", label: "X" },
        { id: "b20", order: 20, label: "B" },
        { id: "a10", order: 10, label: "A" },
        { id: "b20-too", order: 20, label: "C" },
      ],
      [{ id: "y", label: "Y" }],
    );
    expect(ids(items)).toEqual(["a10", "b20", "b20-too", "x", "y"]);
  });

  it("keeps the position of a replaced item among ties and takes its new order", () => {
    const items = composeItems(
      [
        { id: "a", order: 1, label: "A" },
        { id: "b", order: 1, label: "B" },
        { id: "c", label: "C" },
      ],
      [
        { id: "a", order: 1, label: "A2" },
        { id: "c", order: 0, label: "C2" },
      ],
    );
    expect(items.map((i) => i.label)).toEqual(["C2", "A2", "B"]);
  });

  it("passes children through", () => {
    const children = [{ id: "c", label: "C" }];
    expect(composeItems([{ id: "p", label: "P", children }], [])[0].children).toBe(children);
  });
});
