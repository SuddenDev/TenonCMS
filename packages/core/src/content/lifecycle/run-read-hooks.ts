import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { type ContentTarget, target } from "../targets.ts";
import { hookArgs } from "./hook-args.ts";
import { slot } from "./collect-hooks.ts";
import { runHooks } from "../../schema/runtime/run-hooks.ts";
import { type Operation } from "../../schema/index.ts";
import { runFieldHooks } from "../../schema/runtime/run-field-hooks.ts";
import { stripDenied } from "../../access/field-access.ts";

/**
 * Runs field `afterRead` hooks per document, then the collection's or global's once for the batch, then removes what
 * the caller cannot read (`stripDenied()`). Every read, populated documents and write results pass here.
 * @returns The documents the hooks return.
 */
export async function afterRead(
  core: Core,
  s: Inner,
  name: ContentTarget,
  docs: Record<string, any>[],
  operation: Operation,
  draft = false,
) {
  const { fields } = target(core, name);

  for (const doc of docs)
    await runFieldHooks(
      "afterRead",
      fields,
      doc,
      hookArgs(s, name, { operation, data: doc, draft }),
    );

  const args = hookArgs(s, name, { operation, draft });
  const result = await runHooks(slot(core, name, "afterRead"), "docs", docs, args);
  await stripDenied(core, s, name, result);
  return result;
}

/**
 * Runs the `beforeRead` hooks of the collection or global on the loaded documents.
 * @returns The documents the hooks return.
 */
export function beforeRead(
  core: Core,
  s: Inner,
  name: ContentTarget,
  docs: Record<string, any>[],
  operation: Operation,
) {
  const args = hookArgs(s, name, { operation });
  return runHooks(slot(core, name, "beforeRead"), "docs", docs, args);
}
