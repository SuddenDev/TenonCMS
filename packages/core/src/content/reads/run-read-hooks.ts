import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { type Name, target } from "../targets.ts";
import { hookArgs } from "../lifecycle/hook-args.ts";
import { slot } from "../lifecycle/collect-hooks.ts";
import { runHooks } from "../../schema/hooks/run.ts";
import { type Operation } from "../../schema/index.ts";
import { fieldHooks } from "../../schema/walk.ts";

/** Field `afterRead` per document, then the collection's or global's once for the batch. */
export async function afterRead(
  core: Core,
  s: Inner,
  name: Name,
  docs: Record<string, any>[],
  operation: Operation,
  draft = false,
) {
  const { fields } = target(core, name);
  for (const doc of docs)
    await fieldHooks("afterRead", fields, doc, hookArgs(s, name, { operation, data: doc, draft }));
  return runHooks(
    slot(core, name, "afterRead"),
    "docs",
    docs,
    hookArgs(s, name, { operation, draft }),
  );
}

export const beforeRead = (
  core: Core,
  s: Inner,
  name: Name,
  docs: Record<string, any>[],
  operation: Operation,
) => runHooks(slot(core, name, "beforeRead"), "docs", docs, hookArgs(s, name, { operation }));
