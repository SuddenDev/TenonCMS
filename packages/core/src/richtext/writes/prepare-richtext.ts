import type { Core } from "../../cms/runtime/types.ts";
import type { Fields } from "../../schema/fields/index.ts";
import { ValidationError } from "../../errors.ts";
import { linkingValues } from "../../links/runtime/fields.ts";
import { deletedTargets, keepDeletedMarker } from "../../links/runtime/held-links.ts";
import { richtextReferences, storedRichtext, walkRichtext } from "../runtime/walk.ts";
import { validateRichtext } from "../runtime/validation.ts";

const richtextValues = (fields: Fields, data: Record<string, any>) =>
  linkingValues(fields, data).filter((f) => f.field.type === "richtext");

/** Canonicalizes rich text and protects server-owned deletion markers on every write, including drafts. */
export function prepareRichtext(
  core: Core,
  fields: Fields,
  data: Record<string, any>,
  source: Record<string, any> | undefined,
  loose: boolean,
  validatedSource: Record<string, any> | undefined,
) {
  const deleted = deletedTargets(fields, source);
  const validated = new Map(
    richtextValues(fields, validatedSource ?? {}).map((f) => [f.path, f.value]),
  );

  for (const held of richtextValues(fields, data)) {
    try {
      const value = storedRichtext(held.value);
      walkRichtext(value, (node) => {
        if (node.type === "link" && node.attrs?.target === "_blank")
          node.attrs.rel = "noopener noreferrer";
      });

      for (const { reference } of richtextReferences(value)) keepDeletedMarker(reference, deleted);

      const baseline = validated.get(held.path);
      const unchanged =
        baseline && JSON.stringify(value) === JSON.stringify(storedRichtext(baseline));
      const active = held.active;
      if (!loose && active && !unchanged) validateRichtext(value, held.field, core.admin.richtext);

      held.parent[held.key] = value;
    } catch (error) {
      throw new ValidationError({ [held.path]: (error as Error).message });
    }
  }
}
