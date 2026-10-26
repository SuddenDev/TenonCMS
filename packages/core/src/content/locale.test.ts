import { describe, expect, it } from "vitest";
import type { Core, Scope } from "../cms/runtime/types.ts";
import { ValidationError } from "../errors.ts";
import { withLocale } from "./locale.ts";

const scope: Scope = { user: null, context: {}, nested: false, overrideAccess: true };
const core = (localization?: Partial<NonNullable<Core["localization"]>>) =>
  ({
    localization: localization && {
      locales: ["en", "de"],
      defaultLocale: "en",
      fallback: true,
      routing: false,
      ...localization,
    },
  }) as Core;

describe("withLocale", () => {
  it("defaults to the default locale and the configured fallback", () => {
    expect(withLocale(core(), scope, {}).locale).toBeUndefined();
    expect(withLocale(core({}), scope, {})).toMatchObject({ locale: "en", fallback: true });
    expect(withLocale(core({ fallback: false }), scope, {})).toMatchObject({ fallback: false });
  });

  it("takes the option over the scope", () => {
    const inherited = { ...scope, locale: "de", fallback: false };
    expect(withLocale(core({}), inherited, {})).toMatchObject({ locale: "de", fallback: false });
    expect(withLocale(core({}), inherited, { locale: "en", fallback: true })).toMatchObject({
      locale: "en",
      fallback: true,
    });
  });

  it("rejects an unknown locale", () => {
    expect(() => withLocale(core({}), scope, { locale: "fr" })).toThrow(
      new ValidationError({ locale: "Unknown locale" }),
    );
  });

  it("rejects a locale without localization", () => {
    expect(() => withLocale(core(), scope, { locale: "en" })).toThrow(ValidationError);
  });
});
