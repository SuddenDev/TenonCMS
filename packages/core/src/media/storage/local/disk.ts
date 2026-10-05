import { mkdir, rmdir, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

/** Paths under the storage directory, and folder housekeeping. */
export type Disk = ReturnType<typeof createDisk>;

/**
 * Binds path helpers to `dir`. Keys are cleaned by core; `path()` keeps a bad key from leaving `dir` anyway.
 * @throws From `path()`, for a key that resolves outside `dir`.
 */
export function createDisk(dir: string) {
  const root = resolve(dir);

  function path(key: string) {
    const p = resolve(root, key);
    if (!p.startsWith(root + sep)) throw new Error(`Invalid key "${key}"`);
    return p;
  }

  // Removes empty folders from `p` up to the root. Stops at the first folder that is not empty.
  async function prune(p: string) {
    for (let d = dirname(p); d !== root && d.startsWith(root); d = dirname(d)) {
      try {
        await rmdir(d);
      } catch {
        return;
      }
    }
  }

  return {
    root,
    path,
    prune,
    /** Creates the folder that holds `p`. */
    parent: (p: string) => mkdir(dirname(p), { recursive: true }),
    /** The stats of `p`, or `undefined` when nothing is there. */
    exists: (p: string) =>
      stat(p).then(
        (s) => s,
        () => undefined,
      ),
  };
}
