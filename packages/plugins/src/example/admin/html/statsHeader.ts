import type { PageHeader } from "integral-cms/admin";
import type { Stats } from "../../types.ts";

/** The title, plus the quote count linked to the quotes list. */
export const statsHeader: PageHeader<Stats> = (_crumbs, { data, integral }) => `
  <div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">
    Quote stats&nbsp;&bullet;&nbsp;<a style="text-decoration:underline" href="${integral.base}/content/collections/quotes">${data.count} quotes</a>
  </div>`;
