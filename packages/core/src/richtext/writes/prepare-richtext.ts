import type { Core } from "../../cms/runtime/types.ts";
import type { Fields } from "../../schema/fields/index.ts";
import { ValidationError } from "../../errors.ts";
import { richtextFields } from "../runtime/fields.ts";
import { richtextReferences, storedRichtext, walkRichtext } from "../runtime/walk.ts";
import { validateRichtext } from "../runtime/validation.ts";

/** Canonicalizes rich text and protects server-owned deletion markers on every write, including drafts. */
export function prepareRichtext(
  core: Core,
  fields: Fields,
  data: Record<string, any>,
  source: Record<string, any> | undefined,
  loose: boolean,
  validatedSource: Record<string, any> | undefined,
) {
  const originals = new Map(richtextFields(fields, source ?? {}).map((f) => [f.path, f.value]));
  const deleted = new Set(
    [...originals.values()].flatMap((value) =>
      richtextReferences(value)
        .filter((r) => r.reference.deleted)
        .map((r) => `${r.reference.collection}:${r.reference.id}`),
    ),
  );
  const validated = new Map(
    richtextFields(fields, validatedSource ?? {}).map((f) => [f.path, f.value]),
  );

  for (const held of richtextFields(fields, data)) {
    try {
      const value = storedRichtext(held.value);
      walkRichtext(value, (node) => {
        if (node.type === "link" && node.attrs?.target === "_blank")
          node.attrs.rel = "noopener noreferrer";
      });

      for (const { reference } of richtextReferences(value)) {
        const known = deleted.has(`${reference.collection}:${reference.id}`);
        if (reference.deleted && !known)
          throw new Error("Deletion markers are owned by the server");

        if (known) reference.deleted = true;
      }

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
