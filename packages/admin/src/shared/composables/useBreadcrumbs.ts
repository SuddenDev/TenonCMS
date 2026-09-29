import { computed, onUnmounted, ref, watchEffect } from "vue";
import { type RouteLocation, useRoute, useRouter } from "vue-router";

declare module "vue-router" {
  interface RouteMeta {
    /** Label in the breadcrumbs. Routes without one are skipped. */
    breadcrumb?: string | ((route: RouteLocation) => string);
    /** Path of the parent crumb when it is not the parent path, e.g. `/media` for `/media-file/:id`. */
    parent?: string;
  }
}

export type Crumb = { label: string; to: string };

// Label a view sets for its own crumb, bound to the path it was set on.
const override = ref<{ path: string; label: string }>();

/**
 * Crumbs for the current route, generated from the router: every parent path that resolves to a
 * route with `meta.breadcrumb`, up to `/`.
 */
export function useBreadcrumbs() {
  const route = useRoute();
  const router = useRouter();

  function trail(path: string): Crumb[] {
    const r = router.resolve(path);
    const up = r.meta.parent ?? (path.slice(0, path.lastIndexOf("/")) || "/");
    const parents = path === "/" ? [] : trail(up);
    const { breadcrumb } = r.meta;
    if (!r.matched.length || !breadcrumb) return parents;
    const label = typeof breadcrumb === "string" ? breadcrumb : breadcrumb(r);
    return [...parents, { label, to: r.path }];
  }

  return computed(() => {
    const crumbs = trail(route.path);
    const last = crumbs.at(-1);
    if (last && override.value?.path === route.path) last.label = override.value.label;
    return crumbs;
  });
}

/** Sets the current page's crumb, for labels the route cannot know, like a document title. */
export function useBreadcrumb(label: () => string | undefined) {
  const path = useRoute().path;
  watchEffect(() => {
    const l = label();
    override.value = l ? { path, label: l } : undefined;
  });
  onUnmounted(() => {
    if (override.value?.path === path) override.value = undefined;
  });
}
