import type { ClientRef } from "./index.d.ts";
export type * from "./index.d.ts";

// A module path with an optional `#export` name.
const SPECIFIER = /^[^#]+(?:#[\w$]+)?$/;

/**
 * Names a browser export. The adapter finds the literal call in the static import graph and bundles the export.
 * @throws If `specifier` is empty or not `<module>` or `<module>#<export>`.
 */
export function clientRef<T = any>(specifier: string): ClientRef<T> {
  if (!specifier || !SPECIFIER.test(specifier))
    throw new Error("integral-cms: clientRef MUST name a module and an optional export");
  return { clientRef: specifier };
}
