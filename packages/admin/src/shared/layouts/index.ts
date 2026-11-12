import type { PageDescriptor } from "../../../../core/src/admin/index.d.ts";
import DefaultLayout from "./default.vue";

export const layouts = { default: DefaultLayout };

declare module "vue-router" {
  interface RouteMeta {
    /** Public authentication screen, without the admin layout. */
    auth?: boolean;
    /** Only for visitors: a signed-in admin is sent on to `?redirect=`, else to the start. */
    guest?: boolean;
    /** Only for users with the role `admin`. Others are sent to the start. */
    admin?: boolean;
    /** The layout that wraps the view. Defaults to `default`. */
    layout?: keyof typeof layouts;
    /** The view renders its own columns next to the menu, instead of one scrolling page. */
    panes?: boolean;
    /** The view is a page of its own: full width, without the menu or panes. The top bar stays. */
    full?: boolean;
    /** The header above a view without panes. Defaults to none. */
    pageHeader?: PageDescriptor["pageHeader"];
    /** Key of the host page this route shows. */
    page?: string;
    /** The host page has a server loader. */
    load?: true;
  }
}
