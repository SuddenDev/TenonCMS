import type {
  AdminBarItemDescriptor,
  AdminBarItemRegistration,
  AdminBarOptions,
  AdminBarPosition,
  BarItemLoadContext,
  PluginAdminOptions,
} from "../index";
import { checkAdminBarPosition } from "../../preview/config/admin-bar.ts";
import { builtIns } from "../../preview/runtime/admin-bar-items.ts";
import { describeBarItem, type DescribedItem } from "../describe/describe-bar-item.ts";
import { isObject, type Loader } from "../describe/registration-checks.ts";

/** The admin bar of the instance. Items keep insertion order. Sorting by `order` happens when they are composed. */
export type AdminBar = {
  position: AdminBarPosition;
  /**
   * Effective item descriptors: the plugins' items, then the host's, replaced by key in place.
   * A `false` item stays as `{ id, hidden: true }`, so it can also remove a built-in item.
   */
  items: AdminBarItemDescriptor[];
  /** Loaders of the effective items and their children, by id. */
  loaders: Map<string, Loader<BarItemLoadContext>>;
};

const BUILT_IN_IDS = new Set([...builtIns("site"), ...builtIns("preview-tab")].map((i) => i.id));

/**
 * Checks the `adminBar` option of one source and adds its items to `items`, replacing by key.
 * @param isHost Only the host MAY disable the bar or set its position.
 * @throws For a malformed option, or a dropdown child that uses a built-in id.
 */
export function addBarItems(
  items: Map<string, DescribedItem>,
  bar: false | AdminBarOptions | PluginAdminOptions["adminBar"] | undefined,
  source: string,
  isHost: boolean,
) {
  if (bar === undefined || bar === false) {
    if (bar === false && !isHost)
      throw new Error(`tenoncms: admin.adminBar in ${source}: only the host can disable the bar`);
    return;
  }
  if (typeof bar !== "object" || bar === null)
    throw new Error(`tenoncms: admin.adminBar in ${source} MUST be false or an object`);
  if (!isHost && "position" in bar)
    throw new Error(`tenoncms: admin.adminBar in ${source}: only the host sets the position`);
  if (bar.items !== undefined && !isObject(bar.items))
    throw new Error(`tenoncms: admin.adminBar.items in ${source} MUST be an object of items by id`);

  for (const [id, item] of Object.entries(bar.items ?? {}) as [
    string,
    AdminBarItemRegistration | false,
  ][]) {
    const described =
      item === false
        ? { descriptor: { id, hidden: true as const }, loaders: [] }
        : describeBarItem(id, item, source);
    for (const child of described.descriptor.children ?? [])
      if (BUILT_IN_IDS.has(child.id))
        throw new Error(
          `tenoncms: child "${child.id}" of admin bar item "${described.descriptor.id}" in ${source} uses a built-in id; only a top-level item can replace a built-in`,
        );
    items.set(described.descriptor.id, described);
  }
}

/**
 * Builds the instance's bar from the collected items.
 * @param host The host's `adminBar` option. `false` turns the bar off.
 * @returns The bar, or `false` without one.
 * @throws For an unknown position or a duplicate item id, children included.
 */
export function buildBar(
  host: false | AdminBarOptions | undefined,
  entries: Map<string, DescribedItem>,
): false | AdminBar {
  if (host !== undefined && host !== false) checkAdminBarPosition(host.position);
  if (host === false) return false;
  return { position: host?.position ?? "bottom-center", ...effectiveBar(entries) };
}

// Drops the loaders of replaced items and checks that every id is unique, children included.
function effectiveBar(entries: Map<string, DescribedItem>) {
  const items: AdminBarItemDescriptor[] = [];
  const loaders = new Map<string, Loader<BarItemLoadContext>>();
  const ids = new Set<string>();
  const claim = (id: string) => {
    if (ids.has(id)) throw new Error(`tenoncms: duplicate admin bar item id "${id}"`);
    ids.add(id);
  };
  for (const { descriptor, loaders: own } of entries.values()) {
    claim(descriptor.id);
    for (const child of descriptor.children ?? []) claim(child.id);
    items.push(descriptor);
    for (const [id, loader] of own) loaders.set(id, loader as Loader<BarItemLoadContext>);
  }
  return { items, loaders };
}
