import DefaultLayout from "./default.vue";

export const layouts = { default: DefaultLayout };

declare module "vue-router" {
  interface RouteMeta {
    /** The layout that wraps the view. Defaults to `default`. */
    layout?: keyof typeof layouts;
  }
}
