import { describe, expect, it, vi } from "vitest";
import { defineCms, definePlugin } from "../index.ts";
import { clientRef } from "../admin/config.ts";
import { admin, base, origin, setup } from "./setup.ts";

describe("admin registration", () => {
  it("exposes only branding publicly and active registrations after sign-in", async () => {
    const plugin = definePlugin({
      name: "reports",
      admin: {
        fields: { color: { mount: clientRef("./color.ts") } },
        pages: { reports: { mount: clientRef("reports/admin#mount") } },
        adminBar: { items: { reports: { label: "Reports", href: "/reports" } } },
      },
    });
    const { client, fetch } = setup(
      defineCms({
        ...base,
        plugins: [plugin],
        admin: {
          name: "My CMS",
          logo: "/logo.svg",
          adminBar: { items: { help: { label: "Help", href: "/help" } } },
        },
      }),
    );
    expect(await (await fetch(`${origin}/_tenon/admin-brand`)).json()).toEqual({
      name: "My CMS",
      logo: "/logo.svg",
    });
    expect((await fetch(`${origin}/_tenon/schema`)).status).toBe(401);
    expect((await fetch(`${origin}/_tenon/admin-bar?url=/&mode=site`)).status).toBe(401);
    await client.signUp(admin);
    const schema = await client.getSchema();
    expect(schema.admin).toEqual({
      name: "My CMS",
      logo: "/logo.svg",
      fields: { color: { mount: { clientRef: "./color.ts" } } },
      pages: { reports: { mount: { clientRef: "reports/admin#mount" } } },
    });
    expect(await (await fetch(`${origin}/_tenon/admin-bar?url=/&mode=site`)).json()).toMatchObject({
      position: "bottom-center",
      branding: { name: "My CMS" },
    });
  });

  it("sends loader flags but never runs or serializes a loader", async () => {
    const pageLoad = vi.fn(() => ({ secret: "page" }));
    const fieldLoad = vi.fn(() => ({ secret: "field" }));
    const itemLoad = vi.fn(() => ({ secret: "item" }));
    const { client, fetch } = setup(
      defineCms({
        ...base,
        admin: {
          fields: { color: { mount: clientRef("./color"), load: fieldLoad } },
          pages: { stats: { mount: clientRef("./stats"), load: pageLoad } },
          adminBar: {
            items: { x: { label: "X", mount: clientRef("./x"), load: itemLoad } },
          },
        },
      }),
    );
    await client.signUp(admin);
    const text = await (await fetch(`${origin}/_tenon/schema`)).text();
    expect(JSON.parse(text).admin).toMatchObject({
      fields: { color: { load: true } },
      pages: { stats: { load: true } },
    });
    expect(text).not.toContain("secret");
    for (const load of [pageLoad, fieldLoad, itemLoad]) expect(load).not.toHaveBeenCalled();
  });

  it("keeps the registrations of two instances apart", async () => {
    const a = setup(defineCms({ ...base, admin: { pages: { a: { mount: clientRef("./a") } } } }));
    const b = setup(
      defineCms({
        ...base,
        admin: { pages: { b: { mount: clientRef("./b") } }, adminBar: false },
      }),
    );
    await a.client.signUp(admin);
    await b.client.signUp(admin);
    expect(Object.keys((await a.client.getSchema()).admin!.pages)).toEqual(["a"]);
    expect(Object.keys((await b.client.getSchema()).admin!.pages)).toEqual(["b"]);
    expect((await a.fetch(`${origin}/_tenon/admin-bar?url=/&mode=site`)).status).toBe(200);
    expect((await b.fetch(`${origin}/_tenon/admin-bar?url=/&mode=site`)).status).toBe(404);
  });

  it("throws at startup for a bad registration", () => {
    expect(() => defineCms({ ...base, admin: { fields: { color: {} } } } as never)).toThrow(
      "admin.fields.color.mount",
    );
    expect(() => defineCms({ ...base, admin: { adminBar: { position: "top" as never } } })).toThrow(
      "adminBar.position",
    );
  });
});
