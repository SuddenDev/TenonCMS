import { computed, inject } from "vue";
import { schema } from "../api";
import { optionsKey, pagePath } from "../lib/options";

/** One list for collections, globals and pages, by `order`. Equal orders keep their definition order. */
export function useMenu() {
  const pages = Object.entries(inject(optionsKey, {}).pages ?? {});
  return computed(() =>
    [
      // `media` is the media library, with a page of its own.
      ...Object.entries(schema.value.collections ?? {}).map(([name, c]) =>
        name === "media"
          ? { label: c.label ?? "Media", icon: "image", order: 15, to: "/media" }
          : { label: c.label ?? name, icon: "folder", order: 10, to: `/collections/${name}` },
      ),
      ...Object.entries(schema.value.globals ?? {}).map(([name, g]) => ({
        label: g.label ?? name,
        icon: "settings",
        order: 20,
        to: `/globals/${name}`,
      })),
      ...pages.flatMap(([key, p]) =>
        p.menu ? [{ icon: "file", order: 30, ...p.menu, to: pagePath(key, p) }] : [],
      ),
    ].sort((a, b) => a.order - b.order),
  );
}
