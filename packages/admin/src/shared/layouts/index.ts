import DefaultLayout from "./default.vue";

export const layouts = { default: DefaultLayout };

declare module "vue-router" {
  interface RouteMeta {
    /** The layout that wraps the view. Defaults to `default`. */
    layout?: keyof typeof layouts;
    /** The view renders its own columns next to the menu, instead of one scrolling page. */
    panes?: boolean;
  }
}
