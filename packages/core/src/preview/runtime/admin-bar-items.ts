import type { ResolvedBarItem } from "../../admin/load/resolve-bar-item.ts";

/**
 * The built-in items as stubs, each marked `builtIn: true`. Only core sets the marker. A registration that
 * replaces a built-in by id never has it, because registrations copy known keys only. The browser fills the
 * links of the `dashboard` and `edit` stubs and renders the `perspective` and `live-edit` controls.
 * @param mode `preview-tab` shows the editor link and overlay switch.
 */
export function builtIns(mode: "site" | "preview-tab"): ResolvedBarItem[] {
  if (mode === "preview-tab")
    return [
      { id: "edit", order: 10, label: "Back to visual editor", icon: "arrow-left", builtIn: true },
      { id: "live-edit", order: 20, label: "Edit preview", builtIn: true },
    ];
  return [
    { id: "dashboard", order: 10, label: "Dashboard", builtIn: true },
    { id: "edit", order: 20, label: "Edit", icon: "pencil", builtIn: true },
    { id: "perspective", order: 30, label: "Drafts", builtIn: true },
  ];
}

/**
 * Appends `added` to `list` and sorts the result by `order`, equal orders in insertion order. Items without an
 * `order` follow the ordered ones in insertion order.
 * @returns A new list. An item replaces an earlier one with the same id in its place.
 */
export function composeItems<T extends { id: string; order?: number }>(list: T[], added: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of [...list, ...added]) byId.set(item.id, item);

  const order = (item: T) => item.order ?? Number.POSITIVE_INFINITY;
  // Two unordered items give `NaN`, which counts as equal.
  return [...byId.values()].sort((a, b) => order(a) - order(b) || 0);
}
