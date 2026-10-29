import type { Resolver } from "./types.ts";

/** Imports that hold no `clientRef()` calls of the host: Node built-ins and the package's own entries. */
const LEAVES =
  /^(node:|tenoncms\/(admin(?:\/|$)|client$|richtext$|preview(?:\/|$)|media\/)|tenoncms$)/;

/**
 * Resolves an import to the file the scan MAY follow.
 * @returns `null` for leaves and for imports the `resolver` cannot resolve.
 */
export async function resolveImport(resolver: Resolver, id: string, importer: string) {
  if (LEAVES.test(id)) return null;
  return resolver(id, importer);
}
