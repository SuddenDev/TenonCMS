import { type AdminLocale, translator } from "tenoncms/admin";
import de from "../locales/de.json";
import en from "../locales/en.json";

/** The example's browser strings in the admin language: `texts(ctx.tenon.locale)("count", { n: 3 })`. */
export const texts = (locale: AdminLocale) => translator({ en, de }, locale);
