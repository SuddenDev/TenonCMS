import { computed, inject } from "vue";
import { schema } from "@/shared/api";
import { optionsKey, pagePath } from "@/shared/options";

export type MenuItem = {
  label: string;
  icon: string;
  to: string;
  order: number;
  children?: MenuItem[];
};

const byOrder = (a: MenuItem, b: MenuItem) => a.order - b.order;

/**
 * The sidebar: `content` holds collections, the media library and globals, `pages` the host pages.
 * Each list is sorted by `order`; equal orders keep their definition order.
 */
export function useMenu() {
  const pages = Object.entries(inject(optionsKey, {}).pages ?? {});
  return computed(() => ({
    content: [
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
    ].sort(byOrder),
    pages: pages
      .flatMap(([key, p]) =>
        p.menu ? [{ icon: "file", order: 30, ...p.menu, to: pagePath(key, p) }] : [],
      )
      .sort(byOrder),
  }));
}
