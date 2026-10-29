import type { AdminBarItemContext, Mount } from "tenoncms/admin";
import { renderVue } from "tenoncms/admin/vue";
import Count from "./Count.vue";

// Its own entry, because the bar's module graph MUST NOT contain CSS and the page entry has some.

/** Mounts {@link Count}: the quote count as a badge in the admin bar. */
export const mountCount: Mount<AdminBarItemContext<number>> = renderVue(Count);
