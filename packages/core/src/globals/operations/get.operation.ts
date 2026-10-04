import type { Core, Scope } from "../../cms/runtime/types.ts";
import type { LocalApi } from "../../schema/hooks/index.ts";
import { glob } from "../../content/targets.ts";
import { run } from "../../content/lifecycle/run-operation.ts";
import { readGlobal } from "../../content/reads/read-global.ts";

export async function getGlobal(
  core: Core,
  scope: Scope,
  name: string,
  options: NonNullable<Parameters<LocalApi["getGlobal"]>[1]> = {},
) {
  return run(core, scope, "getGlobal", glob(name), { global: name, options }, (s, args) =>
    readGlobal(core, s, name, args.options),
  );
}
