import { describe, expect, it } from "vitest";
import { clientRef } from "../config.ts";
import { adminBrand, mergeAdmin } from "./merge-options.ts";

const load = () => ({ ok: true });

describe("admin registration merge", () => {
  it("merges plugins before the host and lets the host's branding win", () => {
    const { descriptor } = mergeAdmin(
      [
        {
          name: "first",
          admin: {
            name: "Plugin",
            logo: "/plugin.svg",
            fields: { color: { mount: clientRef("./color") } },
          },
        },
      ],
      { name: "Host", pages: { stats: { mount: clientRef("./stats"), title: "Stats" } } },
    );
    expect(descriptor).toEqual({
      name: "Host",
      logo: "/plugin.svg",
      fields: { color: { mount: { clientRef: "./color" } } },
      pages: { stats: { mount: { clientRef: "./stats" }, title: "Stats" } },
    });
    expect(adminBrand(descriptor)).toEqual({ name: "Host", logo: "/plugin.svg" });
  });

  it("keeps loaders out of the descriptor and flags them", () => {
    const { descriptor, fieldLoaders, pageLoaders } = mergeAdmin([], {
      fields: { color: { mount: clientRef("./color"), load } },
      pages: {
        stats: { mount: clientRef("./stats"), load, pageHeader: clientRef("./stats#head") },
      },
    });
    expect(descriptor.fields.color).toEqual({ mount: { clientRef: "./color" }, load: true });
    expect(descriptor.pages.stats).toEqual({
      mount: { clientRef: "./stats" },
      pageHeader: { clientRef: "./stats#head" },
      load: true,
    });
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
    expect(fieldLoaders.get("color")?.load).toBe(load);
    expect(pageLoaders.get("stats")?.load).toBe(load);
  });

  it("rejects duplicate fields and pages", () => {
    const one = { mount: clientRef("./one") };
    expect(() =>
      mergeAdmin([{ name: "first", admin: { fields: { color: one } } }], {
        fields: { color: one },
      }),
    ).toThrow('duplicate admin fields key "color"');
    expect(() =>
      mergeAdmin([{ name: "first", admin: { pages: { a: one } } }], { pages: { a: one } }),
    ).toThrow('duplicate admin pages key "a"');
  });

  it("does not look up loaders through the prototype", () => {
    const { fieldLoaders } = mergeAdmin([], {});
    expect(fieldLoaders.get("constructor")).toBeUndefined();
    expect(fieldLoaders.get("__proto__")).toBeUndefined();
  });
});

describe("admin bar registration merge", () => {
  const link = (extra = {}) => ({ label: "x", href: "/x", ...extra });

  it("is enabled at bottom-center by default and reads the host's position", () => {
    expect(mergeAdmin([], {}).bar).toMatchObject({ position: "bottom-center", items: [] });
    expect(mergeAdmin([], { adminBar: { position: "top-right" } }).bar).toMatchObject({
      position: "top-right",
    });
    expect(mergeAdmin([], { adminBar: false }).bar).toBe(false);
  });

  it("uses the key as the id, collects plugin items, then host items, and replaces by key in place", () => {
    const { bar } = mergeAdmin(
      [
        {
          name: "a",
          admin: {
            adminBar: {
              items: { one: link({ label: "one" }), two: link({ label: "two", order: 5 }) },
            },
          },
        },
        { name: "b", admin: { adminBar: { items: { three: link({ label: "three" }) } } } },
      ],
      { adminBar: { items: { one: link({ label: "Host one", order: 1 }) } } },
    );
    if (!bar) throw new Error("bar disabled");
    expect(bar.items.map((i) => [i.id, i.label, i.order])).toEqual([
      ["one", "Host one", 1],
      ["two", "two", 5],
      ["three", "three", undefined],
    ]);
  });

  it("keeps a false item as a tombstone and lets a later item revive it", () => {
    const { bar } = mergeAdmin(
      [{ name: "a", admin: { adminBar: { items: { edit: false, x: link() } } } }],
      { adminBar: { items: { x: false } } },
    );
    if (!bar) throw new Error("bar disabled");
    expect(bar.items).toEqual([
      { id: "edit", hidden: true },
      { id: "x", hidden: true },
    ]);
    const revived = mergeAdmin([{ name: "a", admin: { adminBar: { items: { x: false } } } }], {
      adminBar: { items: { x: link() } },
    }).bar;
    if (!revived) throw new Error("bar disabled");
    expect(revived.items).toEqual([{ id: "x", label: "x", href: "/x" }]);
  });

  it("registers loaders by effective id, children included", () => {
    const parentLoad = () => null;
    const childLoad = () => ({ n: 1 });
    const replaced = () => ({ n: 2 });
    const { bar } = mergeAdmin(
      [
        {
          name: "a",
          admin: {
            adminBar: {
              items: {
                menu: {
                  label: "Menu",
                  load: parentLoad,
                  children: {
                    child: { label: "Child", onClick: clientRef("./c#go"), load: childLoad },
                  },
                },
                old: { label: "Old", mount: clientRef("./o"), load: parentLoad },
              },
            },
          },
        },
      ],
      {
        adminBar: { items: { old: { label: "New", mount: clientRef("./n"), load: replaced } } },
      },
    );
    if (!bar) throw new Error("bar disabled");
    expect(bar.loaders.get("menu")?.load).toBe(parentLoad);
    expect(bar.loaders.get("child")?.load).toBe(childLoad);
    expect(bar.loaders.get("old")?.load).toBe(replaced);
    expect(bar.loaders.get("old")?.source).toBe("tenon.config.ts");
    expect(bar.loaders.size).toBe(3);
    expect(bar.items[0]).toEqual({
      id: "menu",
      label: "Menu",
      load: true,
      children: [{ id: "child", label: "Child", onClick: { clientRef: "./c#go" }, load: true }],
    });
    expect(JSON.parse(JSON.stringify(bar.items))).toEqual(bar.items);
  });

  it("rejects a child id that another item uses", () => {
    expect(() =>
      mergeAdmin([], {
        adminBar: {
          items: {
            a: link(),
            m: { label: "M", children: { a: { label: "A", href: "/a" } } },
          },
        },
      }),
    ).toThrow('duplicate admin bar item id "a"');
  });

  it("rejects a dropdown child with a built-in id, but allows a top-level replacement", () => {
    for (const id of ["dashboard", "edit", "perspective", "live-edit"]) {
      expect(() =>
        mergeAdmin([], {
          adminBar: {
            items: { m: { label: "M", children: { [id]: { label: "X", href: "/x" } } } },
          },
        }),
      ).toThrow(`child "${id}" of admin bar item "m"`);
      expect(() => mergeAdmin([], { adminBar: { items: { [id]: link() } } })).not.toThrow();
    }
  });
});

describe("admin registration validation", () => {
  const host = (admin: object) => () => mergeAdmin([], admin as never);

  it("only accepts functions in load", () => {
    expect(host({ fields: { color: { mount: () => {} } } })).toThrow("clientRef()");
    expect(host({ pages: { p: { mount: clientRef("./p"), pageHeader: () => "" } } })).toThrow(
      "clientRef()",
    );
    expect(host({ adminBar: { items: { a: { label: "A", onClick: () => {} } } } })).toThrow(
      "clientRef()",
    );
    expect(host({ adminBar: { items: { a: { label: "A", mount: () => {} } } } })).toThrow(
      "clientRef()",
    );
    expect(host({ pages: { p: { mount: clientRef("./p"), nav: () => {} } } })).toThrow(
      "Only load may be a function",
    );
    expect(host({ logo: () => {} })).toThrow("Only load may be a function");
    expect(host({ fields: { color: { mount: clientRef("./c"), load: "x" } } })).toThrow(
      "MUST be a function",
    );
  });

  it("requires a field mount, an items object and a valid position", () => {
    expect(host({ fields: { color: {} } })).toThrow("admin.fields.color.mount");
    expect(host({ adminBar: { items: () => ({}) } })).toThrow(
      "items in tenon.config.ts MUST be an object",
    );
    expect(host({ adminBar: { items: [{ id: "a", label: "A" }] } })).toThrow(
      "items in tenon.config.ts MUST be an object",
    );
    expect(host({ adminBar: { position: "top" } })).toThrow("adminBar.position");
  });

  it("rejects conflicting item render options", () => {
    const item = (extra: object) => host({ adminBar: { items: { a: { label: "A", ...extra } } } });
    const ref = clientRef("./a");
    expect(item({ mount: ref, href: "/a" })).toThrow("mount cannot be combined");
    expect(item({ mount: ref, onClick: ref })).toThrow("mount cannot be combined");
    expect(item({ mount: ref, children: {} })).toThrow("mount cannot be combined");
    expect(item({ onClick: ref, href: "/a" })).toThrow("onClick cannot be combined");
    expect(item({ onClick: ref, children: {} })).toThrow("onClick cannot be combined");
    expect(item({ children: { b: { label: "B", children: {} } } })).toThrow(
      "children cannot have children",
    );
  });

  it("requires a label and a plain value, for children too", () => {
    const item = (x: unknown) => host({ adminBar: { items: { a: x } } });
    expect(item({})).toThrow('admin bar item "a" in tenon.config.ts MUST have a label');
    expect(item(true)).toThrow('admin bar item "a" in tenon.config.ts MUST be an object or false');
    expect(item(null)).toThrow("MUST be an object or false");
    expect(item(false)).not.toThrow();
    expect(item({ label: "A" })).not.toThrow();
    expect(item({ label: { en: "A", de: "B" } })).not.toThrow();
    for (const label of [{}, { en: "" }, { fr: "A" }, ["A"]])
      expect(item({ label })).toThrow('admin bar item "a" in tenon.config.ts MUST have a label');
    expect(item({ label: "A", children: { b: {} } })).toThrow(
      'admin bar item "b" in tenon.config.ts MUST have a label',
    );
    expect(item({ label: "A", children: { b: false } })).toThrow(
      'item "b" in tenon.config.ts MUST be an object',
    );
    expect(item({ label: "A", children: [{ id: "b", label: "B" }] })).toThrow(
      "children MUST be an object",
    );
  });

  it("limits plugins to bar items", () => {
    const plugin = (admin: object) => () => mergeAdmin([{ name: "p", admin } as never], {});
    expect(plugin({ adminBar: false })).toThrow("only the host");
    expect(plugin({ adminBar: { position: "top-left" } })).toThrow("only the host");
  });
});
