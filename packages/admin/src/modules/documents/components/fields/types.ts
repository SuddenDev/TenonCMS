import type { Text } from "../../../../../../core/src/admin/index.d.ts";
import type { Field, Fields } from "@/shared/api";

/** Context shared by field renderers. `path` defaults to `name`; `loose` suppresses required checks in empty optional groups. */
export type FieldProps<T extends Field["type"] = Field["type"]> = {
  name: string;
  description?: Text;
  field: Field & { type: T };
  root: Record<string, unknown>;
  siblings: { fields: Fields; data: Record<string, unknown> };
  isNew?: boolean;
  loose?: boolean;
  path?: string;
  errors?: Record<string, string>;
  shared?: boolean;
  placeholders?: Record<string, unknown>;
};
