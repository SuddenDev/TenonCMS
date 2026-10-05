import type { AdminBarItem, ServerAdminBarItem } from "../../admin/index.d.ts";
import type { Unsubscribe } from "../config/types.ts";

let pageItems: AdminBarItem[] = [];
const listeners = new Set<() => void>();

/**
 * The built-in items as stubs. The server cannot see the page, so the client fills `edit` and `perspective`
 * into whatever stubs the hooks leave.
 * @param mode `preview-tab` adds `exit-preview`.
 */
export function builtIns(mode: "site" | "preview-tab"): ServerAdminBarItem[] {
  const items: ServerAdminBarItem[] = [
    { id: "dashboard", group: "start", order: 10, label: "Dashboard" },
    { id: "edit", group: "end", order: 10, label: "Edit" },
    { id: "live-edit", group: "end", order: 20, label: "Live edit" },
    { id: "perspective", group: "end", order: 30, label: "Drafts" },
  ];
  if (mode === "preview-tab")
    items.push({ id: "exit-preview", group: "end", order: 40, label: "Exit preview" });
  return items;
}

/**
 * Appends `added` to `list` and sorts the result: `start` before `end`, then by `order`. Items without an
 * `order` follow the ordered ones in insertion order.
 * @returns A new list. An item replaces an earlier one with the same id in its place.
 */
export function composeItems(list: AdminBarItem[], added: AdminBarItem[]): AdminBarItem[] {
  const byId = new Map<string, AdminBarItem>();
  for (const item of [...list, ...added]) byId.set(item.id, item);

  const rank = (item: AdminBarItem) => (item.group === "start" ? 0 : 1);
  const order = (item: AdminBarItem) => item.order ?? Number.POSITIVE_INFINITY;
  // Two unordered items give `NaN`, which counts as equal.
  return [...byId.values()].sort((a, b) => rank(a) - rank(b) || order(a) - order(b) || 0);
}

/**
 * Adds an item to the admin bar from page code. It goes after the server's items and replaces one with the same id.
 * @returns Removes the item again.
 * @example
 * const remove = addAdminBarItem({ id: "clear-cache", label: "Clear cache", onClick: () => fetch("/purge") })
 */
export function addAdminBarItem(item: AdminBarItem): () => void {
  pageItems = [...pageItems, item];
  notify();
  return () => {
    pageItems = pageItems.filter((i) => i !== item);
    notify();
  };
}

/** The items page code added, in the order of the calls. */
export const getAddedItems = () => pageItems;

/** Calls `cb` whenever page code adds or removes an item. */
export function subscribeItems(cb: () => void): Unsubscribe {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify() {
  for (const cb of listeners) cb();
}
