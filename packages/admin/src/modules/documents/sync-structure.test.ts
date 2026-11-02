import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import de from "@/shared/i18n/de";
import en from "@/shared/i18n/en";
import type { Fields } from "@/shared/api";
import { structureDialog, untranslatedIds } from "./sync-structure";

const fields = {
  title: { type: "text" },
  content: {
    type: "blocks",
    blocks: {
      hero: {
        fields: {
          heading: { type: "text" },
          meta: { type: "group", fields: { a: { type: "text" } } },
        },
      },
      columns: {
        fields: {
          left: { type: "blocks", blocks: { text: { fields: { body: { type: "text" } } } } },
        },
      },
    },
  },
} as unknown as Fields;

describe("untranslatedIds", () => {
  it("finds items without any value of their own, at any depth", () => {
    const doc = {
      content: [
        { id: "a", blockType: "hero", heading: null, meta: { a: null } },
        { id: "b", blockType: "hero", heading: "Hi", meta: null },
        { id: "c", blockType: "hero", heading: null, meta: { a: "x" } },
        { id: "d", blockType: "columns", left: [{ id: "e", blockType: "text", body: null }] },
      ],
    };
    expect([...untranslatedIds(fields, doc)]).toEqual(["a", "e"]);
  });

  it("is empty without lists", () => {
    expect(untranslatedIds(fields, { title: null }).size).toBe(0);
  });
});

describe("structureDialog", () => {
  const t = createI18n({ legacy: false, locale: "en", messages: { en, de } }).global;

  it("lists the changes of every other language", () => {
    const text = structureDialog(
      { en: { removed: 2, added: 1 }, de: { removed: 0, added: 0 }, fr: { removed: 0, added: 0 } },
      "de",
      t,
    );
    expect(text.description).toBe(
      "English: 2 items removed, 1 item added without translation. The German content structure is used in every language.",
    );
  });

  it("says when nothing changes", () => {
    expect(structureDialog({ de: { removed: 0, added: 0 } }, "de", t).description).toBe(
      "No language changes. The German content structure is used in every language.",
    );
  });
});
