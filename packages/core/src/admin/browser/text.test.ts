import { describe, expect, it } from "vitest";
import { translate, translator } from "./text.ts";

describe("translate", () => {
  it("returns a string for every language", () => {
    expect(translate("Posts", "de")).toBe("Posts");
  });

  it("picks the language, then English, then the first entry", () => {
    expect(translate({ en: "Posts", de: "Beiträge" }, "de")).toBe("Beiträge");
    expect(translate({ en: "Posts" }, "de")).toBe("Posts");
    expect(translate({ de: "Beiträge" }, "en")).toBe("Beiträge");
  });

  it("keeps a missing value missing", () => {
    expect(translate(undefined, "de")).toBeUndefined();
    expect(translate({}, "de")).toBeUndefined();
  });
});

describe("translator", () => {
  const messages = {
    en: { stats: { title: "Stats", count: "{n} quotes" }, only: "English only" },
    de: { stats: { title: "Statistik", count: "{n} Zitate" } },
  };

  it("looks up dotted keys in the language and fills parameters", () => {
    const t = translator(messages, "de");
    expect(t("stats.title")).toBe("Statistik");
    expect(t("stats.count", { n: 3 })).toBe("3 Zitate");
  });

  it("falls back to English, then to the key", () => {
    const t = translator(messages, "de");
    expect(t("only")).toBe("English only");
    expect(t("missing.key")).toBe("missing.key");
  });

  it("keeps an unknown parameter as written", () => {
    expect(translator(messages, "en")("stats.count")).toBe("{n} quotes");
  });
});
