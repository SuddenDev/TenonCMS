import type { User } from "better-auth";
import { consola } from "consola";
import type { ServerAdminBarItem } from "../../admin/index.d.ts";
import type { LocalApi } from "../../cms/api/local-api.ts";
import type { Plugin } from "../../plugins/types.ts";

/** What an admin bar items hook gets besides the items. */
export type AdminBarHookContext = {
  /** The signed-in user. */
  user: User;
  /** The local API, with that user. */
  cms: LocalApi;
  /** The URL of the page the bar shows on. It comes from the browser and is never fetched. */
  url: string;
};

/**
 * Changes the admin bar's items. Gets the whole list and returns a new one, so it can add, replace, reorder or
 * drop items. A hook that throws is logged and skipped.
 * @example
 * items: (items, { url }) => [...items, { id: "analytics", label: "Analytics", href: `/admin/reports?url=${url}` }]
 */
export type AdminBarItemsHook = (
  items: ServerAdminBarItem[],
  ctx: AdminBarHookContext,
) => ServerAdminBarItem[] | Promise<ServerAdminBarItem[]>;

/** The admin bar signed-in editors see on the site. */
export type AdminBarOptions = {
  /** Edge of the page the bar sits at. Defaults to `top`. */
  position?: "top" | "bottom";
  /** Changes the items. Runs after the plugins' hooks. */
  items?: AdminBarItemsHook;
};

/**
 * Runs the plugins' items hooks in the order of `plugins`, then the host's. A hook that throws is logged and
 * skipped, so one broken plugin does not hide the bar.
 * @returns The items of the last hook that succeeded.
 */
export async function runItemHooks(
  plugins: readonly Plugin[],
  options: AdminBarOptions,
  items: ServerAdminBarItem[],
  ctx: AdminBarHookContext,
) {
  const hooks = [
    ...plugins.map((p) => [`plugin "${p.name}"`, p.adminBar?.items] as const),
    ["adminBar", options.items] as const,
  ];
  for (const [source, hook] of hooks) {
    if (!hook) continue;
    try {
      items = await hook(items, ctx);
    } catch (e) {
      consola.withTag("integral").error(`The admin bar items hook of ${source} failed`, e);
    }
  }
  return items;
}
