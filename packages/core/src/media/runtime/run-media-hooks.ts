import { col } from "../../content/targets.ts";
import type { Core, Inner } from "../../cms/runtime/types.ts";
import { hookArgs } from "../../content/lifecycle/hook-args.ts";
import { list, runHooks } from "../../schema/runtime/run-hooks.ts";
import type { MediaHooks } from "../../schema/index.ts";

/** Runs the media hooks of `stage` on `value`: the host's, then each plugin's in `plugins` order. */
export function runMediaHooks<V>(
  core: Core,
  s: Inner,
  stage: keyof MediaHooks,
  key: string,
  value: V,
  extra: object = {},
): Promise<V> {
  const slot = [
    ...list<(args: any) => unknown>(core.media?.hooks[stage]),
    ...core.plugins.flatMap((p) => list<(args: any) => unknown>(p.mediaHooks?.[stage])),
  ];
  return runHooks(slot, key, value, hookArgs(s, col("media"), extra));
}
