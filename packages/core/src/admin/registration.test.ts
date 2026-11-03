import { describe, expect, it } from "vitest";
import { defineCms, definePlugin } from "../index.ts";
import { clientRef } from "./config.ts";
import type {
  AdminBarItemContext,
  AdminBarItemRegistration,
  AdminOptions,
  FieldContext,
  Mount,
  PageContext,
  PageHeader,
  PageRegistration,
  PluginAdminOptions,
} from "./index.d.ts";
import { libsql } from "../integrations/libsql/index.ts";

const base = { database: libsql(":memory:"), secret: "" };
const ref = clientRef("./x");

// These tests check types. `@ts-expect-error` fails the typecheck when a line is NOT an error.
describe("admin registration types", () => {
  it("types loader contexts from the inline config", () => {
    defineCms({
      ...base,
      admin: {
        pages: {
          stats: {
            mount: ref,
            load: async ({ cms, user, params, query }) => {
              const email: string = user.email;
              const id: string | string[] = params.id;
              const tab = query.tab;
              return { email, id, tab, posts: await cms.find("posts", { populate: false }) };
            },
          },
        },
        fields: {
          color: {
            mount: ref,
            load: ({ field, path, owner, cms }) => {
              const type: string = field.type;
              const where = "global" in owner ? owner.global : owner.collection;
              void cms;
              return { type, path, where, id: "id" in owner ? owner.id : null };
            },
          },
        },
        adminBar: {
          items: {
            a: { label: "A", load: ({ url, user }) => ({ href: `/r?u=${url}`, label: user.name }) },
            b: { label: "B", onClick: ref, load: ({ cms }) => cms.find("posts") },
            c: { label: "C", mount: ref, load: () => null },
          },
        },
      },
    });
    expect(true).toBe(true);
  });

  it("rejects wrong loader context access", () => {
    defineCms({
      ...base,
      admin: {
        pages: {
          // @ts-expect-error a page loader has no `url`
          a: { mount: ref, load: ({ url }) => url },
          // @ts-expect-error a page loader has no `owner`
          b: { mount: ref, load: ({ owner }) => owner },
        },
        fields: {
          // @ts-expect-error a field loader has no `params`
          c: { mount: ref, load: ({ params }) => params },
        },
        adminBar: {
          items: {
            // @ts-expect-error a bar loader has no `params`
            d: { label: "D", load: ({ params }) => params },
          },
        },
      },
    });
    expect(true).toBe(true);
  });

  it("checks an extracted object with satisfies", () => {
    const admin = {
      name: "Host",
      fields: { color: { mount: clientRef("./color") } },
      pages: { stats: { title: "Stats", mount: clientRef("./stats"), pageHeader: false } },
      adminBar: { position: "top-right", items: { a: { label: "A", href: "/a" } } },
    } satisfies AdminOptions;
    defineCms({ ...base, admin });
    expect(admin.name).toBe("Host");
  });

  it("accepts explicitly typed references and checks the loader against them", () => {
    type Data = { n: number };
    const typed = {
      mount: clientRef<Mount<PageContext<Data>>>("./stats"),
      pageHeader: clientRef<PageHeader<Data>>("./stats#head"),
      load: () => ({ n: 1 }),
    } satisfies PageRegistration<Data>;
    defineCms({ ...base, admin: { pages: { stats: typed } } });
    ({
      mount: clientRef<Mount<PageContext<Data>>>("./stats"),
      // @ts-expect-error the loader MUST return what the mount expects
      load: () => ({ n: "one" }),
    }) satisfies PageRegistration<Data>;
    const field: FieldContext<Data>["data"] = { n: 1 };
    const item = {
      label: "A",
      onClick: clientRef<(ctx: AdminBarItemContext<Data>) => void>("./a"),
      load: () => ({ n: 1 }),
    } satisfies AdminBarItemRegistration<Data>;
    expect([field, item.label]).toBeTruthy();
  });

  it("rejects loader results that are not JSON", () => {
    defineCms({
      ...base,
      admin: {
        pages: {
          // @ts-expect-error a function is not JSON
          a: { mount: ref, load: () => ({ fn: () => {} }) },
          // @ts-expect-error a Date is not JSON
          b: { mount: ref, load: () => ({ at: new Date() }) },
          // @ts-expect-error a bigint is not JSON
          c: { mount: ref, load: () => 1n },
        },
        adminBar: {
          items: {
            // @ts-expect-error a link item loads overrides
            d: { label: "D", load: () => ({ unrelated: 1 }) },
          },
        },
      },
    });
    expect(true).toBe(true);
  });

  it("accepts typed browser imports at the source boundary", () => {
    void (() =>
      defineCms({
        ...base,
        admin: {
          fields: { color: { mount: () => () => {} } },
          pages: {
            a: { mount: () => () => {} },
            b: { mount: ref, pageHeader: () => "" },
          },
          adminBar: {
            items: {
              a: { label: "A", onClick: () => {} },
              b: { label: "B", mount: () => () => {} },
            },
          },
        },
      }));
    expect(true).toBe(true);
  });

  it("rejects conflicting bar item options and a bare field reference", () => {
    const items: Record<string, AdminBarItemRegistration | false> = {
      // @ts-expect-error mount owns the rendering
      a: { label: "A", mount: ref, href: "/a" },
      // @ts-expect-error a button cannot also be a dropdown
      b: { label: "B", onClick: ref, children: {} },
      // @ts-expect-error a child cannot have children
      c: { label: "C", children: { d: { label: "D", children: {} } } },
      // @ts-expect-error the key is the id
      e: { id: "e", label: "E" },
      // @ts-expect-error removing an item takes false, not hidden
      f: { hidden: true },
      // @ts-expect-error a label is required
      g: {},
      // @ts-expect-error children are keyed by id, not listed
      h: { label: "H", children: [{ id: "i", label: "I" }] },
    };
    // @ts-expect-error a field is { mount }, not a bare reference
    const options: AdminOptions = { fields: { color: ref } };
    expect([items, options]).toBeTruthy();
  });

  it("accepts children with every item option except children", () => {
    const item: AdminBarItemRegistration = {
      label: "Menu",
      icon: "menu",
      order: 3,
      children: {
        a: { label: "A", href: "/a", load: () => null },
        b: { label: "B", onClick: ref, load: () => ({ n: 1 }) },
        c: { label: "C", mount: ref },
      },
    };
    expect(item.label).toBe("Menu");
  });

  it("rejects an invalid position", () => {
    // @ts-expect-error an invalid position
    const c: AdminOptions = { adminBar: { position: "left" } };
    expect(c).toBeTruthy();
  });

  it("limits plugins to bar items", () => {
    const plugin = definePlugin({
      name: "p",
      admin: { pages: { a: { mount: ref } }, adminBar: { items: { a: { label: "A" } } } },
    });
    // @ts-expect-error only the host sets the position
    const a: PluginAdminOptions = { adminBar: { position: "top-left" } };
    // @ts-expect-error only the host can disable the bar
    const b: PluginAdminOptions = { adminBar: false };
    expect([plugin, a, b]).toBeTruthy();
  });
});
