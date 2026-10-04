import { computed, inject } from "vue";
import { useRoute } from "vue-router";
import { groupMenu } from "../../../../core/src/admin/menu";
import type { Nav } from "../../../../core/src/admin/index.d.ts";
import { schema } from "@/shared/api";
import { CONTENT, optionsKey, pagePath } from "@/shared/options";

export type MenuItem = {
  label: string;
  icon: string;
  to: string;
  order: number;
  group?: string;
  description?: string;
  /** Extra paths that mark the item active, besides `to`. */
  also?: string[];
  children?: MenuItem[];
};

type Entry = MenuItem & { display: NonNullable<Nav["display"]> };

function entry(
  base: { label: string; description?: string; icon: string; order: number; to: string },
  nav: Nav = {},
): Entry {
  const { display = "content", icon, order, group } = nav;
  return { ...base, icon: icon ?? base.icon, order: order ?? base.order, group, display };
}

// Every collection, global and page with its `nav` defaults, wherever it is shown.
function useEntries() {
  const options = inject(optionsKey, {});
  const pages = Object.entries(options.pages ?? {});
  return computed<Entry[]>(() => [
    ...Object.entries(schema.value.collections ?? {}).map(([name, c]) =>
      // `media` is the media library, with a page of its own.
      name === "media"
        ? entry(
            {
              label: options.media?.label ?? "Media",
              icon: "image",
              order: 15,
              to: `${CONTENT}/media`,
            },
            options.media?.nav,
          )
        : entry(
            {
              label: c.label ?? name,
              description: c.description,
              icon: "folder",
              order: 10,
              to: `${CONTENT}/collections/${name}`,
            },
            c.nav,
          ),
    ),
    ...Object.entries(schema.value.globals ?? {}).map(([name, g]) =>
      entry(
        {
          label: g.label ?? name,
          description: g.description,
          icon: "settings",
          order: 20,
          // Settings globals open next to the Settings list.
          to:
            g.nav?.display === "settings"
              ? `${CONTENT}/settings/globals/${name}`
              : `${CONTENT}/globals/${name}`,
        },
        g.nav,
      ),
    ),
    ...pages.map(([key, p]) =>
      entry(
        {
          label: p.title ?? key,
          description: p.description,
          icon: "file",
          order: 30,
          to: pagePath(key, p),
        },
        p.nav,
      ),
    ),
  ]);
}

/** The items with `nav.display: "settings"`, in sections (default `Site`), for the Settings page. */
export function useSettings() {
  const entries = useEntries();
  return computed(() =>
    groupMenu<MenuItem>(
      entries.value.filter((e) => e.display === "settings"),
      "Site",
    ),
  );
}

/**
 * The sidebar sections: items with `nav.display` `content` or unset, each in its `group` (default
 * `Content`). Sorted by `order`; equal orders keep their definition order. A Settings entry under
 * `Admin` is added when any item is shown on the Settings page.
 */
export function useMenu() {
  const entries = useEntries();
  const settings = useSettings();
  return computed(() => {
    const items: MenuItem[] = entries.value.filter((e) => e.display === "content");
    const targets = settings.value.flatMap((g) => g.items.map((i) => i.to));
    if (targets.length)
      items.push({
        label: "Settings",
        icon: "settings",
        group: "Manage",
        order: 100,
        to: `${CONTENT}/settings`,
        also: targets,
      });
    return groupMenu(items);
  });
}

export type Tool = MenuItem & { active: boolean };

/**
 * The top bar tools: Content (order 5), Visual Editor (order 10) and every entry with
 * `nav.display: "main"`, all sorted by `order`.
 */
export function useToolbar() {
  const entries = useEntries();
  const route = useRoute();
  return computed<Tool[]>(() => {
    const at = (to: string) => route.path === to || route.path.startsWith(`${to}/`);
    const tools: MenuItem[] = [
      { label: "Content", icon: "layout-list", to: CONTENT, order: 5 },
      { label: "Visual Editor", icon: "eye", to: "/presentation", order: 10 },
      ...entries.value.filter((e) => e.display === "main"),
    ];
    return tools
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ ...t, active: [t.to, ...(t.also ?? [])].some(at) }));
  });
}
