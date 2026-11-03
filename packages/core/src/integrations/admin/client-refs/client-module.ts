import { realpathSync } from "node:fs";
import { relative } from "node:path";
import { describeModule, parseModule } from "./module-syntax.ts";
import type { Resolver } from "./types.ts";

export function isClientModule(file: string): boolean {
  return /\.client\.[cm]?[jt]sx?$/.test(file.split("?")[0]);
}

export function clientModuleId(root: string, file: string): string {
  return `./${relative(realpathSync(root), realpathSync(file)).replaceAll("\\", "/")}`;
}

/** Reads export names without executing browser code. Star cycles stop at the first visit. */
export async function clientModuleExports(
  file: string,
  resolver: Resolver,
  seen = new Set<string>(),
): Promise<Set<string>> {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const info = describeModule(await parseModule(file));
  const names = new Set([...info.exports.keys(), ...info.reexports.keys()]);
  for (const source of info.stars) {
    const target = await resolver(source, file);
    if (!target) throw new Error(`tenoncms: cannot resolve ${source} from ${file}`);
    for (const name of await clientModuleExports(target, resolver, seen))
      if (name !== "default") names.add(name);
  }
  return names;
}
