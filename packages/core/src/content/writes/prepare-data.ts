import { prepareRichtext } from "../../richtext/writes/prepare-richtext.ts";
import { prepareLinks } from "../../links/writes/prepare-links.ts";
import type { WriteState } from "./write-document.ts";
import { slot } from "../../content/lifecycle/collect-hooks.ts";
import { runHooks } from "../../schema/runtime/run-hooks.ts";
import { isObject } from "../../schema/condition.ts";
import { parseData } from "../../schema/validation/parse-data.ts";
import { applyDefaults } from "../../schema/runtime/apply-defaults.ts";
import { runFieldHooks } from "../../schema/runtime/run-field-hooks.ts";
import { fillSlugs } from "../../schema/runtime/fill-slugs.ts";
import { validateFields } from "../../schema/runtime/validate-fields.ts";
import { ValidationError } from "../../errors.ts";

/** Runs defaults, slugs, validation and before-change hooks in write order. Mutates only a cloned input. */
export async function prepareData(state: WriteState, input: unknown) {
  const { core, target: name, operation, sourceData, fields, args, mode, locale } = state;
  const loose = mode === "draft" || (mode === "deletion-effect" && !!locale);
  const fieldArgs = (data: Record<string, unknown>) => ({ ...args, data });

  // Updates and global writes replace only the top-level keys they receive.
  const copy =
    sourceData && isObject(input)
      ? { ...stripMeta(sourceData), ...structuredClone(input) }
      : structuredClone(input);

  if (isObject(copy)) {
    if (operation === "create") await applyDefaults(fields, copy, args);
    await fillSlugs(fields, copy);
    await runFieldHooks("beforeValidate", fields, copy, fieldArgs(copy));
  }

  const valid = parseData(
    fields,
    await runHooks(slot(core, name, "beforeValidate"), "data", copy, args),
    loose,
  );

  // Delete effects only clear references, so the document's own rules do not apply.
  if (mode !== "deletion-effect" && mode !== "draft") {
    const errors = await validateFields(fields, valid, fieldArgs(valid));
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }

  await runFieldHooks("beforeChange", fields, valid, fieldArgs(valid));

  const prepared = parseData(
    fields,
    await runHooks(slot(core, name, "beforeChange"), "data", valid, args),
    loose,
  );

  prepareRichtext(core, fields, prepared, sourceData, loose, args.originalDoc);
  prepareLinks(core, fields, prepared, sourceData);

  return prepared;
}

const stripMeta = ({
  id,
  createdAt,
  updatedAt,
  publishedAt,
  hasDraft,
  createdBy,
  updatedBy,
  ...data
}: Record<string, unknown>) => data;
