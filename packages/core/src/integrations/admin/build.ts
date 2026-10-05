import { existsSync } from "node:fs";
import { join } from "node:path";

/** Name of the admin's client entry chunk. */
export const adminChunk = "integral-admin";

/** Vite `configEnvironment` hook that adds the admin entry as a second client input. */
export function adminInput(entry: string) {
  return (name: string) =>
    name === "client"
      ? { build: { rolldownOptions: { input: { [adminChunk]: entry } } } }
      : undefined;
}

/** Target of `#integral/admin`: the host's optional `integral.admin.ts`, else the stub in `adminDir`. */
export function adminAlias(root: string, adminDir: string) {
  const file = join(root, "integral.admin.ts");
  return existsSync(file) ? file : join(adminDir, "default.ts");
}
