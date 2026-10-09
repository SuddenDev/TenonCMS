import { describe, expect, it, vi } from "vitest";
import type { AdminBarItemDescriptor, BarItemLoadContext } from "../index.d.ts";
import type { Loader } from "../describe/registration-checks.ts";
import { FAILED, loadBarItem } from "./bar-item.ts";
import { resolveBarItem } from "./resolve-bar-item.ts";

const ctx = { user: { id: "u1" }, cms: {}, url: "/x" } as unknown as BarItemLoadContext;
const loaders = (entries: Record<string, (c: BarItemLoadContext) => unknown>) =>
  new Map<string, Loader<BarItemLoadContext>>(
    Object.entries(entries).map(([id, load]) => [id, { source: "test", load }]),
  );

const link: AdminBarItemDescriptor = { id: "a", label: "A", href: "/a", order: 3, load: true };
const click: AdminBarItemDescriptor = {
  id: "c",
  label: "C",
  onClick: { clientRef: "./c" },
  load: true,
};

describe("resolveBarItem", () => {
  it("returns a static item without the load flag", () => {
    expect(resolveBarItem(link, undefined)).toEqual({ id: "a", label: "A", href: "/a", order: 3 });
  });

  it("overlays label, icon, href and children of a native item", () => {
    const out = resolveBarItem(link, {
      label: "B",
      icon: "bell",
      href: "/b",
      children: { k: { label: "K", order: 2 } },
    });
    expect(out).toEqual({
      id: "a",
      order: 3,
      label: "B",
      icon: "bell",
      href: "/b",
      children: [{ id: "k", label: "K", order: 2 }],
    });
  });

  it("hides a native item for null", () => {
    expect(resolveBarItem(link, null)).toBeNull();
  });

  it.each([
    ["an unknown key", { id: "z" }],
    ["order", { order: 1 }],
    ["onClick", { onClick: { clientRef: "./x" } }],
    ["a prototype key", JSON.parse('{"__proto__":{}}')],
    ["a non-string label", { label: 1 }],
    ["an empty label", { label: "" }],
    ["a non-object result", "text"],
    ["an array result", []],
    ["children that is not an object", { children: "x" }],
    ["children as an array", { children: [{ id: "k", label: "K" }] }],
    ["a child without label", { children: { k: {} } }],
    ["a child with an id", { children: { k: { id: "k", label: "K" } } }],
    ["a child with an unknown key", { children: { k: { label: "K", onClick: 1 } } }],
    ["a child with a bad order", { children: { k: { label: "K", order: "1" } } }],
    ["a child with an empty key", { children: { "": { label: "K" } } }],
  ])("rejects %s of a native item", (_name, loaded) => {
    expect(() => resolveBarItem(link, loaded as never)).toThrow();
  });

  it("puts the result of a click or mount item into data, null included", () => {
    expect(resolveBarItem(click, { n: 1 })).toEqual({
      id: "c",
      label: "C",
      onClick: { clientRef: "./c" },
      data: { n: 1 },
    });
    expect(resolveBarItem(click, null)).toMatchObject({ id: "c", data: null });
    const mount = { id: "m", label: "M", mount: { clientRef: "./m" }, load: true as const };
    expect(resolveBarItem(mount, [1])).toMatchObject({ id: "m", data: [1] });
    expect(resolveBarItem(click, undefined)).not.toHaveProperty("data");
  });

  it("never takes id, order or refs from the loader of a click item", () => {
    const out = resolveBarItem(click, { id: "evil", order: 1, onClick: 1 });
    expect(out).toMatchObject({ id: "c", data: { id: "evil", order: 1, onClick: 1 } });
    expect(out).not.toHaveProperty("order");
  });
});

describe("loadBarItem", () => {
  it("runs the loader with the context and resolves", async () => {
    const load = vi.fn(() => ({ label: "New" }));
    const out = await loadBarItem(link, loaders({ a: load }), ctx);
    expect(load).toHaveBeenCalledWith(ctx);
    expect(out).toMatchObject({ id: "a", label: "New" });
  });

  it("skips items that are hidden or have no loader", async () => {
    expect(await loadBarItem({ id: "h", hidden: true }, loaders({}), ctx)).toBeNull();
    const out = await loadBarItem({ id: "s", label: "S", href: "/s" }, loaders({}), ctx);
    expect(out).toEqual({ id: "s", label: "S", href: "/s" });
  });

  it("returns null when a native loader hides the item", async () => {
    expect(await loadBarItem(link, loaders({ a: () => null }), ctx)).toBeNull();
  });

  it("returns FAILED for a throwing loader or invalid output", async () => {
    const boom = loaders({
      a: () => {
        throw new Error("boom");
      },
    });
    expect(await loadBarItem(link, boom, ctx)).toBe(FAILED);
    expect(await loadBarItem(link, loaders({ a: () => ({ bad: 1 }) }), ctx)).toBe(FAILED);
    expect(await loadBarItem(click, loaders({ c: () => 1n }), ctx)).toBe(FAILED);
    expect(await loadBarItem(click, loaders({ c: () => undefined }), ctx)).toBe(FAILED);
  });

  it("rethrows a loader error on request, but still marks invalid output", async () => {
    const boom = loaders({
      a: () => {
        throw new Error("boom");
      },
    });
    await expect(loadBarItem(link, boom, ctx, { rethrow: true })).rejects.toThrow("boom");
    const bad = loaders({ a: () => ({ bad: 1 }) });
    expect(await loadBarItem(link, bad, ctx, { rethrow: true })).toBe(FAILED);
  });

  it("runs the loaders of registered children and drops failed or hidden ones", async () => {
    const parent: AdminBarItemDescriptor = {
      id: "p",
      label: "P",
      children: [
        { id: "p1", label: "One", href: "/1", load: true },
        { id: "p2", label: "Two", href: "/2", load: true },
        { id: "p3", label: "Three", onClick: { clientRef: "./t" }, load: true },
        { id: "p4", label: "Four", href: "/4" },
      ],
    };
    const out = await loadBarItem(
      parent,
      loaders({
        p1: () => ({ label: "Uno" }),
        p2: () => null,
        p3: () => ({ n: 1 }),
      }),
      ctx,
    );
    expect(out).toMatchObject({
      id: "p",
      children: [
        { id: "p1", label: "Uno" },
        { id: "p3", data: { n: 1 } },
        { id: "p4", label: "Four" },
      ],
    });
  });

  it("does not run child loaders when the parent replaces its children", async () => {
    const child = vi.fn(() => ({ label: "no" }));
    const parent: AdminBarItemDescriptor = {
      id: "p",
      label: "P",
      load: true,
      children: [{ id: "p1", label: "One", href: "/1", load: true }],
    };
    const out = await loadBarItem(
      parent,
      loaders({ p: () => ({ children: { n1: { label: "New" } } }), p1: child }),
      ctx,
    );
    expect(child).not.toHaveBeenCalled();
    expect(out).toMatchObject({ children: [{ id: "n1", label: "New" }] });
  });

  it("does not run child loaders when the parent hides itself", async () => {
    const child = vi.fn(() => ({}));
    const parent: AdminBarItemDescriptor = {
      id: "p",
      label: "P",
      load: true,
      children: [{ id: "p1", label: "One", href: "/1", load: true }],
    };
    expect(await loadBarItem(parent, loaders({ p: () => null, p1: child }), ctx)).toBeNull();
    expect(child).not.toHaveBeenCalled();
  });
});
