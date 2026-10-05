import { describe, expect, it, vi } from "vitest";
import {
  addAdminBarItem,
  builtIns,
  composeItems,
  getAddedItems,
  subscribeItems,
} from "./admin-bar-items.ts";

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("builtIns", () => {
  it("lists the stubs of a site page", () => {
    expect(builtIns("site")).toEqual([
      { id: "dashboard", group: "start", order: 10, label: "Dashboard" },
      { id: "edit", group: "end", order: 10, label: "Edit" },
      { id: "live-edit", group: "end", order: 20, label: "Live edit" },
      { id: "perspective", group: "end", order: 30, label: "Drafts" },
    ]);
  });

  it("adds exit-preview in a preview tab", () => {
    expect(builtIns("preview-tab").at(-1)).toEqual({
      id: "exit-preview",
      group: "end",
      order: 40,
      label: "Exit preview",
    });
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

  it("sorts by group, then order, unordered items last in insertion order", () => {
    const items = composeItems(
      [
        { id: "x", label: "X" },
        { id: "end-20", order: 20, label: "E" },
        { id: "start", group: "start", label: "S" },
        { id: "end-10", group: "end", order: 10, label: "E" },
      ],
      [{ id: "y", label: "Y" }],
    );
    expect(ids(items)).toEqual(["start", "end-10", "end-20", "x", "y"]);
  });

  it("passes children through", () => {
    const children = [{ id: "c", label: "C" }];
    expect(composeItems([{ id: "p", label: "P", children }], [])[0].children).toBe(children);
  });
});

describe("addAdminBarItem", () => {
  it("adds an item until its remover runs and notifies subscribers", () => {
    const cb = vi.fn();
    const unsubscribe = subscribeItems(cb);
    const item = { id: "clear", label: "Clear cache", onClick: () => {} };

    const remove = addAdminBarItem(item);
    expect(getAddedItems()).toEqual([item]);
    expect(cb).toHaveBeenCalledTimes(1);

    remove();
    expect(getAddedItems()).toEqual([]);
    expect(cb).toHaveBeenCalledTimes(2);

    unsubscribe();
    addAdminBarItem(item)();
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
