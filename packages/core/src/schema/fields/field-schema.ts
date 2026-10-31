import { richtextFieldSchema } from "./richtext.ts";
import { linkFieldSchema } from "./link.ts";
import type { z } from "zod";
import { type StoredField, type GroupField, type ArrayField, type BlocksField } from "./index.ts";
import { textSchema } from "./text.ts";
import { dateSchema } from "./date.ts";
import { datetimeSchema } from "./datetime.ts";
import { numberSchema } from "./number.ts";
import { booleanSchema } from "./boolean.ts";
import { selectSchema } from "./select.ts";
import { slugSchema } from "./slug.ts";
import { relationSchema } from "./relation.ts";
import { customSchema } from "./custom.ts";

/**
 * Picks the validator of one stored field that is not a group, an array or a blocks field.
 * @param on Whether the field's condition matches. When `false`, only the type is checked.
 * @returns The field's zod schema, without `optional` or `nullable`.
 */
export function fieldSchema(
  field: Exclude<StoredField, GroupField | ArrayField | BlocksField>,
  on: boolean,
): z.ZodType {
  switch (field.type) {
    case "richtext":
      return richtextFieldSchema();
    case "link":
      return linkFieldSchema();
    case "text":
    case "textarea":
      return textSchema(field, on);
    case "date":
      return dateSchema();
    case "datetime":
      return datetimeSchema();
    case "number":
      return numberSchema(field, on);
    case "boolean":
      return booleanSchema();
    case "select":
      return selectSchema(field, on);
    case "slug":
      return slugSchema(field, on);
    case "relation":
    case "image":
    case "file":
      return relationSchema(field, on);
    default:
      return customSchema(field, on);
  }
}
