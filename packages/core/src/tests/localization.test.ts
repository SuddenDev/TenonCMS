import { describe, expect, expectTypeOf, it } from "vitest";
import { defineCms } from "../index.ts";
import { admin, origin, setup, testDatabase } from "./setup.ts";

const make = (localization?: object) =>
  defineCms({
    collections: { posts: { localized: true, fields: { title: { type: "text" } } } },
    localization: localization as never,
    database: testDatabase(),
    secret: "x".repeat(32),
    media: false,
  });
const l = { locales: ["en", "de"], defaultLocale: "en" };

describe("localization", () => {
  it("answers /localization without a session, normalized", async () => {
    const { fetch } = setup(make(l));
    const res = await fetch(`${origin}/_tenon/localization`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      locales: ["en", "de"],
      defaultLocale: "en",
      fallback: true,
      routing: { prefix: "except-default" },
    });
  });

  it("keeps the host's fallback and routing", async () => {
    const { fetch } = setup(make({ ...l, fallback: false, routing: false }));
    expect(await (await fetch(`${origin}/_tenon/localization`)).json()).toMatchObject({
      fallback: false,
      routing: false,
    });
  });

  it("answers null without localization", async () => {
    const { fetch } = setup(
      defineCms({ database: testDatabase(), secret: "x".repeat(32), media: false }),
    );
    const res = await fetch(`${origin}/_tenon/localization`);
    expect([res.status, await res.json()]).toEqual([200, null]);
  });

  it("sends locales and the default in /schema, and localized per entry", async () => {
    const s = setup(make(l));
    await s.client.signUp(admin);
    const body = await (await s.fetch(`${origin}/_tenon/schema`)).json();
    expect(body.localization).toEqual({ locales: ["en", "de"], defaultLocale: "en" });
    expect(body.collections.posts.localized).toBe(true);
    expect(body.globals.general.localized).toBe(true);
  });

  it("sends no localization in /schema without the option", async () => {
    const s = setup(defineCms({ database: testDatabase(), secret: "x".repeat(32), media: false }));
    await s.client.signUp(admin);
    const body = await (await s.fetch(`${origin}/_tenon/schema`)).json();
    expect(body).not.toHaveProperty("localization");
    expect(body.globals.general.localized).toBeUndefined();
  });

  it("keeps the locales as a literal union", () => {
    const cms = defineCms({
      localization: { locales: ["en", "de"], defaultLocale: "en" },
      database: testDatabase(),
      secret: "x".repeat(32),
      media: false,
    });
    expectTypeOf(cms.localization!.locales).toEqualTypeOf<readonly ("en" | "de")[]>();
    expectTypeOf(cms.localization!.defaultLocale).toEqualTypeOf<"en" | "de">();
    const bad = () =>
      defineCms({
        // @ts-expect-error "fr" is not in locales
        localization: { locales: ["en", "de"], defaultLocale: "fr" },
        database: testDatabase(),
        secret: "x".repeat(32),
      });
    expect(bad).toThrow();
  });
});

it("keeps locale read metadata out of field write-rule documents", async () => {
  const env = setup(
    defineCms({
      database: testDatabase(),
      secret: "x".repeat(32),
      media: false,
      settings: false,
      localization: { locales: ["en", "de"], defaultLocale: "en" },
      collections: {
        pages: {
          localized: true,
          fields: {
            title: {
              type: "text",
              access: { update: ({ doc }) => !Object.hasOwn(doc ?? {}, "locale") },
            },
          },
        },
      },
    }),
  );
  const doc = await env.cms.create("pages", { title: "original" });
  await env.client.signUp(admin);
  expect(
    await env.client.update("pages", doc.id, { title: "edited" }, { locale: "en" }),
  ).toMatchObject({ title: "edited" });
});
