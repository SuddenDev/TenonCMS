import { createApp } from "vue";
import type { FieldContext, Mount, PageContext, PageHeader } from "integral-cms/admin";
import { renderVue } from "integral-cms/admin/vue";
import type { Stats as StatsData } from "../../types.ts";
import Quote from "./Quote.vue";
import RatingField from "./RatingField.vue";
import Stats from "./Stats.vue";
import StatsHeader from "./StatsHeader.vue";

/** Mounts {@link RatingField}: 5 stars that set the rating. */
export const mountRatingField: Mount<FieldContext> = renderVue(RatingField);

/** Mounts {@link Stats}: the stats page from its `load` data. */
export const mountStats: Mount<PageContext<StatsData>> = renderVue(Stats);

/** Mounts {@link Quote}: the quote of the `:id` route param, refetched on route changes. */
export const mountQuote: Mount<PageContext> = renderVue(Quote);

/** The page header: {@link StatsHeader} rendered to an HTML string, because the admin takes a string. */
export const statsHeader: PageHeader<StatsData> = (_crumbs, ctx) => {
  const el = document.createElement("div");
  const app = createApp(StatsHeader, ctx);
  app.mount(el);
  const html = el.innerHTML;
  app.unmount();
  return html;
};
