import type { AdminBarItem } from "../../../core/src/admin/index.d.ts";

/**
 * An item as the CMS sends it. `builtIn` is internal: core sets it on its own built-in stubs, and a registration
 * that replaces a built-in by id never has it.
 */
export type BarItem = AdminBarItem & { builtIn?: true };

/** Whether `item` is core's own built-in with this id, not an item that replaced it. */
export const isBuiltIn = (item: BarItem, id: string) => item.builtIn === true && item.id === id;

/**
 * How the bar renders an item. The built-in `perspective` and `live-edit` are controls.
 * A `mount` item renders itself.
 */
export function kind(item: BarItem) {
  if (isBuiltIn(item, "perspective")) return "perspective";
  if (isBuiltIn(item, "live-edit")) return "edit";
  if (item.mount) return "mount";
  if (item.children) return "menu";
  if (item.href) return "link";
  return "button";
}

/** How a dropdown renders an entry. Entries take everything an item takes, except `children`. */
export function childKind(child: AdminBarItem) {
  if (child.mount) return "mount";
  return child.href ? "link" : "button";
}
