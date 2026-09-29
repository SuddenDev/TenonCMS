import { describe, expect, it } from "vitest";
import { defineCms } from "../index.ts";
import { settings } from "../presets/index.ts";

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
    const cms = defineCms({
      globals: { general: settings.general },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
    await expect(cms.setGlobal("general", { title: "S", url: "a.b" })).rejects.toMatchObject({
      errors: { url: expect.any(String) },
    });
    await cms.setGlobal("general", { title: "S", url: "https://a.b" });
    expect((await cms.getGlobal("general")).url).toBe("https://a.b");
  });
});
