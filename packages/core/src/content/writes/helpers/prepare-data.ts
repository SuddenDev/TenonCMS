import type { Core } from "../../../cms/runtime/types.ts";
import type { Name } from "../../../content/targets.ts";
import type { Fields, Operation } from "../write-document.ts";
import type { HookArgs } from "../../../schema/hooks/index.ts";
import { slot } from "../../../content/lifecycle/collect-hooks.ts";
import { runHooks } from "../../../schema/runtime/run-hooks.ts";
import { isObject } from "../../../schema/condition.ts";
import { parseData } from "../../../schema/validation/parse-data.ts";
import { applyDefaults } from "../../../schema/runtime/apply-defaults.ts";
import { runFieldHooks } from "../../../schema/runtime/run-field-hooks.ts";
import { fillSlugs } from "../../../schema/runtime/fill-slugs.ts";
import { validateFields } from "../../../schema/runtime/validate-fields.ts";
import { ValidationError } from "../../../errors.ts";

const stripMeta = ({
  id,
  createdAt,
  updatedAt,
  publishedAt,
  hasDraft,
  ...data
}: Record<string, unknown>) => data;

type WriteArgs = HookArgs & {
  operation: Operation;
  originalDoc?: Record<string, unknown>;
};

/**
 * Merges input over the source, runs before hooks, and parses the resulting data.
 */
export async function prepareData(
  core: Core,
  name: Name,
  operation: Operation,
  input: unknown,
  source: Record<string, any> | undefined,
  fields: Fields,
  args: WriteArgs,
  draft: boolean,
  effect: boolean | undefined,
) {
  const fieldArgs = (data: Record<string, unknown>) => ({ ...args, data });

  // Updates and global writes replace only the top-level keys they receive.
  const copy =
    source && isObject(input)
      ? { ...stripMeta(source), ...structuredClone(input) }
      : structuredClone(input);

  if (isObject(copy)) {
    if (operation === "create") await applyDefaults(fields, copy, args);
    await fillSlugs(fields, copy);
    await runFieldHooks("beforeValidate", fields, copy, fieldArgs(copy));
  }

  const valid = parseData(
    fields,
    await runHooks(slot(core, name, "beforeValidate"), "data", copy, args),
    draft,
  );

  // Delete effects only clear references, so the document's own rules do not apply.
  if (!effect && !draft) {
    const errors = await validateFields(fields, valid, fieldArgs(valid));
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }

  await runFieldHooks("beforeChange", fields, valid, fieldArgs(valid));
  return parseData(
    fields,
    await runHooks(slot(core, name, "beforeChange"), "data", valid, args),
    draft,
  );
}
