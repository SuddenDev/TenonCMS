import { computed, inject } from "vue";
import { groupMenu } from "../../../../core/src/admin/menu";
import { schema } from "@/shared/api";
import { optionsKey, pagePath } from "@/shared/options";

export type MenuItem = {
  label: string;
  icon: string;
  to: string;
  order: number;
  group?: string;
  children?: MenuItem[];
};

/**
 * The sidebar sections: collections, the media library, globals and the host pages, each with its own
 * `group` (default `Content`). Sorted by `order`; equal orders keep their definition order.
 */
export function useMenu() {
  const options = inject(optionsKey, {});
  const pages = Object.entries(options.pages ?? {});
  return computed(() =>
    groupMenu<MenuItem>([
      ...Object.entries(schema.value.collections ?? {}).map(([name, c]) =>
        // `media` is the media library, with a page of its own.
        name === "media"
          ? { label: "Media", icon: "image", order: 15, ...options.media, to: "/media" }
          : {
              label: c.label ?? name,
              icon: c.icon ?? "folder",
              order: c.order ?? 10,
              group: c.group,
              to: `/collections/${name}`,
            },
      ),
      ...Object.entries(schema.value.globals ?? {}).map(([name, g]) => ({
        label: g.label ?? name,
        icon: g.icon ?? "settings",
        order: g.order ?? 20,
        group: g.group,
        to: `/globals/${name}`,
      })),
      ...pages.flatMap(([key, p]) =>
        p.menu ? [{ icon: "file", order: 30, ...p.menu, to: pagePath(key, p) }] : [],
      ),
    ]),
  );
}
