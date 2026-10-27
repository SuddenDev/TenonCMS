import type { Core, Scope } from "../../cms/runtime/types.ts";
import type { LocalApi } from "../../cms/api/local-api.ts";
import { globalTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import { readGlobal } from "../../content/reads/read-global.ts";

export async function getGlobal(
  core: Core,
  scope: Scope,
  name: string,
  options: NonNullable<Parameters<LocalApi["getGlobal"]>[1]> = {},
) {
  return runOperation(
    core,
    scope,
    "getGlobal",
    globalTarget(name),
    { global: name, options },
    (s, args) => readGlobal(core, s, name, args.options),
  );
}
