import { describe, expect, it } from "vitest";
import { defineCms, definePlugin } from "../index.ts";
import { settings } from "../presets/index.ts";
import { setup } from "./setup.ts";

// Task 5 types these globals; until then the calls are untyped.
const loose = (cms: unknown) => cms as any;

describe("presets", () => {
  it("general has title, tagline, url and favicon", () => {
    const { fields } = settings.general;
    expect(Object.keys(fields)).toEqual(["title", "tagline", "url", "favicon"]);
    expect(fields.title).toMatchObject({ type: "text", required: true });
    expect(fields.favicon.type).toBe("image");
  });

  it("seo has separator, image, verification and noindex", () => {
    const { fields } = settings.seo;
    expect(Object.keys(fields)).toEqual(["separator", "image", "verification", "noindex"]);
    expect(fields.separator).toMatchObject({ type: "text", default: " · " });
    expect(fields.image.type).toBe("image");
    expect(Object.keys(fields.verification.fields)).toEqual(["google", "bing"]);
    expect(fields.noindex.type).toBe("boolean");
  });

  it("place both on the settings hub with a label and a description", () => {
    const { general, seo } = settings;
    expect(general.nav).toMatchObject({ display: "settings", group: "Site", order: 1 });
    expect(seo.nav).toMatchObject({ display: "settings", group: "Site", order: 2 });
    for (const g of [general, seo]) {
      expect(g.label).toBeTruthy();
      expect(g.description).toBeTruthy();
      const walk = (fields: Record<string, any>) => {
        for (const f of Object.values(fields)) {
          expect(f.description, JSON.stringify(f)).toBeTruthy();
          if (f.type === "group") walk(f.fields);
        }
      };
      walk(g.fields);
    }
  });

  it("checks the url pattern", async () => {
    const cms = loose(
      defineCms({
        settings: { general: settings.general },
        database: { url: ":memory:" },
        secret: "x".repeat(32),
      }),
    );
    await expect(cms.setGlobal("general", { title: "S", url: "a.b" })).rejects.toMatchObject({
      errors: { url: expect.any(String) },
    });
    await cms.setGlobal("general", { title: "S", url: "https://a.b" });
    expect((await cms.getGlobal("general")).url).toBe("https://a.b");
  });
});
const opts = { database: { url: ":memory:" }, secret: "x".repeat(32) };
const gen = (fields = {}) => ({ fields: { name: { type: "text" }, ...fields } }) as const;

describe("defineCms", () => {
  it("adds general and seo by default", async () => {
    const cms = loose(defineCms(opts));
    expect(await cms.getGlobal("general")).toEqual({});
    expect(await cms.getGlobal("seo")).toEqual({});
    await expect(cms.setGlobal("general", { tagline: "x" })).rejects.toMatchObject({
      errors: { title: expect.any(String) },
    });
    await cms.setGlobal("general", { title: "Site", url: "https://a.b" });
    expect(await cms.getGlobal("general")).toMatchObject({ title: "Site" });
  });

  it("drops one default or both", async () => {
    const one = loose(defineCms({ ...opts, settings: { seo: false } }));
    await expect(one.getGlobal("seo")).rejects.toThrow();
    expect(await one.getGlobal("general")).toEqual({});
    const none = loose(defineCms({ ...opts, settings: false }));
    await expect(none.getGlobal("general")).rejects.toThrow();
    await expect(none.getGlobal("seo")).rejects.toThrow();
  });

  it("replaces a default with a host global", async () => {
    const cms = loose(
      defineCms({
        ...opts,
        settings: { general: { label: "Mine", fields: { name: { type: "text" } } } },
      }),
    );
    await cms.setGlobal("general", { name: "x" });
    expect(await cms.getGlobal("general")).toEqual({ name: "x" });
    expect(cms.schema.globals.general.label).toBe("Mine");
  });

  it("rejects a host or plugin global that shadows an active default", () => {
    expect(() => defineCms({ ...opts, globals: { general: gen() } })).toThrow(
      'duplicate global "general"',
    );
    expect(() =>
      defineCms({ ...opts, plugins: [definePlugin({ name: "p", globals: { seo: gen() } })] }),
    ).toThrow('duplicate global "seo"');
    expect(() =>
      defineCms({ ...opts, settings: { general: false }, globals: { general: gen() } }),
    ).not.toThrow();
    expect(() => defineCms({ ...opts, settings: false, globals: { seo: gen() } })).not.toThrow();
  });

  it("leaves out favicon and image without media", async () => {
    const cms = loose(defineCms({ ...opts, media: false }));
    const { general, seo } = cms.schema.globals;
    expect(Object.keys(general.fields)).toEqual(["title", "tagline", "url"]);
    expect(Object.keys(seo.fields)).toEqual(["separator", "verification", "noindex"]);
    await cms.setGlobal("general", { title: "Site" });
    expect(await cms.getGlobal("general")).toMatchObject({ title: "Site" });
  });

  it("reads a global over HTTP without a session", async () => {
    const { fetch } = setup(defineCms(opts));
    const res = await fetch("http://localhost/api/cms/globals/general");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });
});
