// Helpers run in browser bundles too, so this file MUST have no imports.

/** A populated `link` value, as `menuItems()` reads it. */
type MenuLink = { href: string | null; title?: string; broken?: true; target?: string };

/** An item of a populated menu read: a block item with an optional `label`, `link` and `children`. */
type MenuEntry = {
  blockType: string;
  label?: string | null;
  link?: MenuLink | null;
  children?: readonly MenuEntry[] | null;
};

type ChildOf<T> = T extends { children?: readonly (infer C)[] | null } ? C : never;
type TargetOf<T> = T extends { link?: infer L }
  ? L extends { target?: infer X }
    ? X
    : never
  : never;

/** One item of {@link menuItems}. Fields other than `blockType`, `label`, `link` and `children` pass through. */
export type MenuItem<T> = T extends MenuEntry
  ? Omit<T, "blockType" | "label" | "link" | "children"> & {
      type: T["blockType"];
      label: string;
      href: string | null;
      target: TargetOf<T> | undefined;
      children: MenuItem<ChildOf<T>>[];
    }
  : never;

/**
 * Turns the items of a menu read into render-ready entries. `label` is the item's label, else its link's title, else
 * `''`. `href` and `target` come from the link; an item without one, like a heading, has `href: null`. An item whose
 * link is broken is left out, with its children. The input MUST be a populated read.
 */
export function menuItems<T extends MenuEntry>(
  items: readonly T[] | null | undefined,
): MenuItem<T>[] {
  return (items ?? []).flatMap((item) => {
    const { blockType, label, link, children, ...rest } = item;
    if (link?.broken) return [];

    return [
      {
        ...rest,
        type: blockType,
        label: label || link?.title || "",
        href: link?.href ?? null,
        target: link?.target,
        children: menuItems(children),
      } as MenuItem<T>,
    ];
  });
}
