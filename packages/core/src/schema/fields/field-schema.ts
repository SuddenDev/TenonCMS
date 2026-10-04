import type { z } from "zod";
import { type StoredField, type GroupField } from "./index.ts";
import { textSchema } from "./text.ts";
import { dateSchema } from "./date.ts";
import { numberSchema } from "./number.ts";
import { booleanSchema } from "./boolean.ts";
import { selectSchema } from "./select.ts";
import { slugSchema } from "./slug.ts";
import { relationSchema } from "./relation.ts";
import { customSchema } from "./custom.ts";

/** The validator of one field. `on`: the field's condition matches. Otherwise only the type is checked. */
export function fieldSchema(field: Exclude<StoredField, GroupField>, on: boolean): z.ZodType {
  switch (field.type) {
    case "text":
    case "textarea":
      return textSchema(field, on);
    case "date":
      return dateSchema();
    case "number":
      return numberSchema(field, on);
    case "boolean":
      return booleanSchema();
    case "select":
      return selectSchema(field);
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
