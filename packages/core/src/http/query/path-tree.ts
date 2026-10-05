import { isObject } from "../../schema/condition.ts";

/**
 * Builds a tree from dot paths, with `true` at the leaves. A longer path wins over its prefix.
 * Nodes MUST have a null prototype, so a `__proto__` segment cannot reach `Object.prototype`.
 * @returns The tree.
 */
export function treeOf(paths: string[]): Record<string, any> {
  const tree = Object.create(null);
  for (const path of paths) {
    const keys = path.split(".");
    const leaf = keys.pop()!;
    let node = tree;
    for (const key of keys)
      node = node[key] = isObject(node[key]) ? node[key] : Object.create(null);
    node[leaf] ??= true;
  }
  return tree;
}
