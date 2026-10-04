import type { Page } from "../../../../core/src/admin/index.d.ts";
import DefaultLayout from "./default.vue";

export const layouts = { default: DefaultLayout };

declare module "vue-router" {
  interface RouteMeta {
    /** The layout that wraps the view. Defaults to `default`. */
    layout?: keyof typeof layouts;
    /** The view renders its own columns next to the menu, instead of one scrolling page. */
    panes?: boolean;
    /** The view is a page of its own: full width, without the menu or panes. The top bar stays. */
    full?: boolean;
    /** The title bar of a host page. Defaults to the breadcrumbs. */
    pageTitle?: Page["showPageTitle"];
  }
}
