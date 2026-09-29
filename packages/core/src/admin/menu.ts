/** Group of items without one. */
const fallback = "Content";

/**
 * Sorts items by `order` and groups them by `group`. Groups appear in the order of their first item, and
 * equal orders keep their definition order.
 */
export function groupMenu<T extends { order: number; group?: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => a.order - b.order)) {
    const label = item.group ?? fallback;
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}
