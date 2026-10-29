import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { FieldContext, Mount, PageContext, PageHeader } from "tenoncms/admin";
import { renderReact } from "tenoncms/admin/react";
import type { Stats as StatsData } from "../../types.ts";
import { Quote } from "./Quote.tsx";
import { RatingField } from "./RatingField.tsx";
import { Stats } from "./Stats.tsx";
import { StatsHeader } from "./StatsHeader.tsx";

/** Mounts {@link RatingField}: 5 stars that set the rating. */
export const mountRatingField: Mount<FieldContext> = renderReact(RatingField);

/** Mounts {@link Stats}: the stats page from its `load` data. */
export const mountStats: Mount<PageContext<StatsData>> = renderReact(Stats);

/** Mounts {@link Quote}: the quote of the `:id` route param, refetched on route changes. */
export const mountQuote: Mount<PageContext> = renderReact(Quote);

/** The page header: {@link StatsHeader} rendered to an HTML string, because the admin takes a string. */
export const statsHeader: PageHeader<StatsData> = (_crumbs, ctx) => {
  const el = document.createElement("div");
  const root = createRoot(el);
  flushSync(() => root.render(createElement(StatsHeader, ctx)));
  const html = el.innerHTML;
  root.unmount();
  return html;
};
