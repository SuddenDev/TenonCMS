import type { PageHeader } from "integral-cms/admin";
import type { Stats } from "../../types.ts";
import { texts } from "../utils/texts.ts";

/** The title, plus the quote count linked to the quotes list. */
export const statsHeader: PageHeader<Stats> = (_crumbs, { data, integral }) => {
  const t = texts(integral.locale);
  return `
  <div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">
    ${t("title")}&nbsp;&bullet;&nbsp;<a style="text-decoration:underline" href="${integral.base}/content/collections/quotes">${t("count", { n: data.count })}</a>
  </div>`;
};
