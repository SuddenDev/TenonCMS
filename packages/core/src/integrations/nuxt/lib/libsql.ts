import { createRequire, findPackageJSON } from "node:module";

/**
 * Paths of the installed libsql native binaries, for Nitro's `traceInclude`. libsql loads them with a dynamic
 * require, which Nitro's file tracer cannot follow.
 * @returns The binary of the current platform. Binaries for other platforms are not installed.
 */
export function libsqlBinaries() {
  const client = createRequire(import.meta.url).resolve("@libsql/client");
  const pkg = findPackageJSON("libsql", client)!;
  const require = createRequire(pkg);
  return Object.keys(require(pkg).optionalDependencies).flatMap((name) => {
    try {
      return [require.resolve(name)];
    } catch {
      // Binaries for other platforms are not installed.
      return [];
    }
  });
}
