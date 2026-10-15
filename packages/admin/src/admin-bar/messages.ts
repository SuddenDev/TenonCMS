import { translate } from "../../../core/src/admin/browser/text.ts";
import type { AdminBarContext, Text } from "../../../core/src/admin/index.d.ts";
import { currentAdminLocale } from "../../../core/src/admin/browser/locale.ts";
import type { BarItem } from "./kind";

// Since the bar runs on the site for every signed-in editor, we keep the bar's strings in their own files (and not use vue-18n here)
import { en, de } from "./i18n";

export function barText() {
  const locale = currentAdminLocale();
  return { ...{ en, de }[locale], label: (value: Text) => translate(value, locale) ?? "" };
}

export function itemLabel(
  item: BarItem,
  mode: AdminBarContext["mode"],
  text: ReturnType<typeof barText>,
) {
  if (item.builtIn) {
    if (item.id === "edit") return mode === "preview-tab" ? text.backToEditor : text.edit;
    if (item.id === "live-edit") return text.liveEdit;
  }
  return text.label(item.label);
}
