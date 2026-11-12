import { computed, inject } from "vue";
import { useRoute } from "vue-router";
import { groupMenu } from "../../../../core/src/admin/browser/menu";
import type { Nav } from "../../../../core/src/admin/index.d.ts";
import { schema } from "@/shared/api";
import { can } from "@/shared/access";
import { i18n, text } from "@/shared/i18n";
import { CONTENT, pagePath, sessionKey } from "@/shared/options";

export type MenuItem = {
  label: string;
  icon: string;
  /** The route, or `""` for an action. */
  to: string;
  /** The key of an admin action: the item is a button that runs it, not a link. */
  action?: string;
  /** The URL of a link action. The item opens it in a new tab. */
  href?: string;
  /** The question to ask before the action runs. */
  confirm?: string;
  order: number;
  group?: string;
  description?: string;
  /** Extra paths that mark the item active, besides `to`. */
  also?: string[];
  children?: MenuItem[];
};

const { t } = i18n.global;

type Entry = MenuItem & { display: NonNullable<Nav["display"]> };

function entry(
  base: { label: string; description?: string; icon: string; order: number; to: string },
  nav: Nav = {},
): Entry {
  const { display = "content", icon, order, group } = nav;
  return {
    ...base,
    icon: icon ?? base.icon,
    order: order ?? base.order,
    group: text(group),
    display,
  };
}

// Every collection, global and page the user MAY read, with its `nav` defaults, wherever it is shown.
function useEntries() {
  return computed<Entry[]>(() => [
    ...Object.entries(schema.value.collections ?? {})
      .filter(([, c]) => can(c, "read"))
      .map(([name, c]) =>
        // `media` is the media library, with a page of its own.
        name === "media"
          ? entry(
              {
                label: text(schema.value.admin?.media?.label) ?? t("nav.media"),
                icon: "image",
                order: 15,
                to: `${CONTENT}/media`,
              },
              schema.value.admin?.media?.nav,
            )
          : entry(
              {
                label: text(c.label) ?? name,
                description: text(c.description),
                icon: "folder",
                order: 10,
                to: `${CONTENT}/collections/${name}`,
              },
              c.nav,
            ),
      ),
    ...Object.entries(schema.value.globals ?? {})
      .filter(([, g]) => can(g, "read"))
      .map(([name, g]) =>
        entry(
          {
            label: text(g.label) ?? name,
            description: text(g.description),
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
    ...Object.entries(schema.value.admin?.pages ?? {}).map(([key, p]) =>
      entry(
        {
          label: text(p.title) ?? key,
          description: text(p.description),
          icon: "file",
          order: 30,
          to: pagePath(key, p),
        },
        p.nav,
      ),
    ),
    // `/schema` lists only the actions the user MAY see. They sit in the top bar by default.
    ...Object.entries(schema.value.admin?.actions ?? {}).map(([key, a]) => {
      const base = { label: text(a.label) ?? key, order: 30, to: "" };
      const nav: Nav = { display: "main", ...a.nav };
      return a.href
        ? { ...entry({ ...base, icon: "external-link" }, nav), href: a.href }
        : { ...entry({ ...base, icon: "zap" }, nav), action: key, confirm: text(a.confirm) };
    }),
  ]);
}

/** The items with `nav.display: "settings"`, in sections (default `Site`), for the Settings page. */
export function useSettings() {
  const entries = useEntries();
  return computed(() =>
    groupMenu<MenuItem>(
      entries.value.filter((e) => e.display === "settings"),
      t("nav.site"),
    ),
  );
}

/**
 * The sidebar sections: items with `nav.display` `content` or unset, each in its `group` (default
 * `Content`). Sorted by `order`; equal orders keep their definition order. The `Manage` section holds
 * Backup (90), Users (100) and API keys (110) for admins, Jobs (120) when the user MAY see a task, and
 * Settings (130) when any item is shown on the Settings page.
 */
export function useMenu() {
  const entries = useEntries();
  const settings = useSettings();
  const session = inject(sessionKey, undefined);
  return computed(() => {
    const items: MenuItem[] = entries.value.filter((e) => e.display === "content");
    const targets = settings.value.flatMap((g) => g.items.map((i) => i.to));
    if (targets.length)
      items.push({
        label: t("nav.settings"),
        icon: "settings",
        group: t("nav.manage"),
        order: 130,
        to: `${CONTENT}/settings`,
        also: targets,
      });
    if (schema.value.jobs?.length)
      items.push({
        label: t("nav.jobs"),
        icon: "list-checks",
        group: t("nav.manage"),
        order: 120,
        to: "/jobs",
      });
    if (session?.user.value?.role === "admin")
      items.push(
        {
          label: t("nav.users"),
          icon: "users",
          group: t("nav.manage"),
          order: 100,
          to: "/users",
        },
        {
          label: t("nav.apiKeys"),
          icon: "key-round",
          group: t("nav.manage"),
          order: 110,
          to: "/api-keys",
        },
        {
          label: t("nav.backup"),
          icon: "database-backup",
          group: t("nav.manage"),
          order: 90,
          to: "/backup",
        },
      );
    return groupMenu(items, t("nav.content"));
  });
}

export type Tool = MenuItem & { active: boolean };

/**
 * The admin's top bar tools: Content (order 5), Visual Editor (order 10) and every entry with
 * `nav.display: "main"`, actions and links included, all sorted by `order`.
 */
export function useAppBar() {
  const entries = useEntries();
  const route = useRoute();
  return computed<Tool[]>(() => {
    const at = (to: string) => route.path === to || route.path.startsWith(`${to}/`);
    const tools: MenuItem[] = [
      { label: t("nav.content"), icon: "layout-list", to: CONTENT, order: 5 },
      { label: t("nav.visualEditor"), icon: "eye", to: "/presentation", order: 10 },
      ...entries.value.filter((e) => e.display === "main"),
    ];
    return tools
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ ...t, active: !!t.to && [t.to, ...(t.also ?? [])].some(at) }));
  });
}
