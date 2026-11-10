import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import de from "@/shared/i18n/de";
import en from "@/shared/i18n/en";
import { localeDialog, localeStatus, rowState } from "./locale-status";

const i18n = (locale: "en" | "de") =>
  createI18n({ legacy: false, locale, messages: { en, de } }).global;
const english = i18n("en");

const published = { publishedAt: "2026-01-01", hasDraft: false };
const edited = { publishedAt: "2026-01-01", hasDraft: true };
const unpublished = { publishedAt: null, hasDraft: true };
const locales = ["en", "de", "fr"];

describe("rowState", () => {
  it("is missing without a row", () => {
    expect(rowState(undefined)).toBe("missing");
  });

  it("is draft with a pending draft or without a publication", () => {
    expect(rowState(edited)).toBe("draft");
    expect(rowState(unpublished)).toBe("draft");
  });

  it("is published otherwise", () => {
    expect(rowState(published)).toBe("published");
  });
});

describe("localeStatus", () => {
  it("lists every locale in order with its state", () => {
    const s = localeStatus({
      locales,
      active: "en",
      rows: { en: published, de: edited },
    });
    expect(s.states).toEqual([
      { locale: "en", state: "published" },
      { locale: "de", state: "draft" },
      { locale: "fr", state: "missing" },
    ]);
    expect(s.active).toBe("published");
  });

  it("makes the active locale a draft while the shared draft is pending", () => {
    const s = localeStatus({ locales, active: "en", rows: { en: published }, sharedDraft: true });
    expect(s.active).toBe("draft");
    expect(s.states[0].state).toBe("draft");
  });

  it("keeps a missing active locale missing", () => {
    const s = localeStatus({ locales, active: "de", rows: { en: published }, sharedDraft: true });
    expect(s.active).toBe("missing");
  });

  it("shows no dot change for other locales when only the shared draft is pending", () => {
    const s = localeStatus({
      locales,
      active: "en",
      rows: { en: published, de: published },
      sharedDraft: true,
    });
    expect(s.states[1].state).toBe("published");
  });

  describe("publishable", () => {
    it("lists the locales with a draft", () => {
      const s = localeStatus({
        locales,
        active: "en",
        rows: { en: published, de: edited, fr: unpublished },
      });
      expect(s.publishable).toEqual(["de", "fr"]);
    });

    it("adds every locale with a row while the shared draft is pending", () => {
      const s = localeStatus({
        locales,
        active: "en",
        rows: { en: published, de: published },
        sharedDraft: true,
      });
      expect(s.publishable).toEqual(["en", "de"]);
    });
  });

  describe("discardAll", () => {
    it("is hidden when only the active locale has a draft", () => {
      const s = localeStatus({ locales, active: "en", rows: { en: edited, de: published } });
      expect(s.discardAll).toEqual({ show: false, shared: false, locales: ["en"] });
    });

    it("shows for another locale's draft", () => {
      const s = localeStatus({ locales, active: "en", rows: { en: published, de: edited } });
      expect(s.discardAll).toEqual({ show: true, shared: false, locales: ["de"] });
    });

    it("shows for the shared draft and lists it first", () => {
      const s = localeStatus({
        locales,
        active: "en",
        rows: { en: edited },
        sharedDraft: true,
      });
      expect(s.discardAll).toEqual({ show: true, shared: true, locales: ["en"] });
    });

    it("counts a never published row as pending", () => {
      const s = localeStatus({ locales, active: "en", rows: { en: published, fr: unpublished } });
      expect(s.discardAll.show).toBe(true);
      expect(s.discardAll.locales).toEqual(["fr"]);
    });

    it("is hidden with nothing pending", () => {
      const s = localeStatus({ locales, active: "en", rows: { en: published, de: published } });
      expect(s.discardAll.show).toBe(false);
    });
  });
});

describe("localeDialog", () => {
  it("overwrites an existing locale", () => {
    expect(localeDialog({ kind: "copy", from: "en", to: "de", exists: true }, english)).toEqual({
      title: "Overwrite German?",
      description: "Its draft will be replaced with the English content.",
      action: "Overwrite",
      destructive: true,
    });
  });

  it("creates a new locale", () => {
    expect(localeDialog({ kind: "copy", from: "en", to: "de", exists: false }, english)).toEqual({
      title: "Create German from English?",
      description: "The English content is saved as a draft.",
      action: "Create",
      destructive: false,
    });
  });

  it("removes a translation", () => {
    expect(localeDialog({ kind: "remove", locale: "de" }, english)).toMatchObject({
      title: "Remove the German translation?",
      action: "Remove",
      destructive: true,
    });
  });

  it("lists the pending parts of a discard", () => {
    expect(
      localeDialog({ kind: "discard", shared: true, locales: ["de", "fr"] }, english).description,
    ).toBe("Shared fields and the German and French drafts go back to the published version.");
    expect(
      localeDialog({ kind: "discard", shared: false, locales: ["de"] }, english).description,
    ).toBe("The German draft goes back to the published version.");
    expect(localeDialog({ kind: "discard", shared: true, locales: [] }, english).description).toBe(
      "Shared fields go back to the published version.",
    );
    expect(localeDialog({ kind: "discard", shared: true, locales: [] }, english)).toMatchObject({
      title: "Discard all changes?",
      action: "Discard",
      destructive: true,
    });
  });

  it("names the languages in the admin language", () => {
    const german = i18n("de");
    expect(localeDialog({ kind: "copy", from: "en", to: "fr", exists: false }, german).title).toBe(
      "Französisch aus Englisch erstellen?",
    );
    expect(
      localeDialog({ kind: "discard", shared: false, locales: ["de", "fr"] }, german).description,
    ).toBe(
      "Die Entwürfe in Deutsch und Französisch werden auf die veröffentlichte Version zurückgesetzt.",
    );
  });
});
