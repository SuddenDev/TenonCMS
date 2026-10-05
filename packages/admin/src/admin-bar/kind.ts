import type { AdminBarContext, AdminBarItem } from "../../../core/src/admin/index.d.ts";

/** How the bar renders an item. `perspective` is a menu, `live-edit` a switch in a preview tab, and a `mount` item renders itself. */
export function kind(item: AdminBarItem, mode: AdminBarContext["mode"]) {
  if (item.id === "perspective") return "perspective";
  if (item.id === "live-edit" && mode === "preview-tab") return "edit";
  if (item.mount) return "mount";
  if (item.children) return "menu";
  if (item.href) return "link";
  return "button";
}
