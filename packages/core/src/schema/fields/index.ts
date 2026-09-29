import type { z } from "zod";
import { type BooleanField, booleanSchema } from "./boolean.ts";
import { type CustomField, customSchema } from "./custom.ts";
import { type DateField, dateSchema } from "./date.ts";
import type { FileField, MediaFieldOptions } from "./file.ts";
import type { GroupField } from "./group.ts";
import type { ImageField, ImageOptions, Modifiers } from "./image.ts";
import type { JoinField } from "./join.ts";
import { type NumberField, numberSchema } from "./number.ts";
import { type RelationField, relationSchema } from "./relation.ts";
import { type SelectField, selectSchema } from "./select.ts";
import { type SlugField, slugSchema } from "./slug.ts";
import { type TextField, textSchema } from "./text.ts";

export type { Base, Common } from "./common.ts";
export type {
  BooleanField,
  CustomField,
  DateField,
  FileField,
  GroupField,
  ImageField,
  ImageOptions,
  MediaFieldOptions,
  Modifiers,
  JoinField,
  NumberField,
  RelationField,
  SelectField,
  SlugField,
  TextField,
};

/** One field of a collection, a global or a group. `type` picks the kind of value. */
export type Field =
  | TextField
  | DateField
  | NumberField
  | BooleanField
  | SelectField
  | CustomField
  | SlugField
  | GroupField
  | RelationField
  | ImageField
  | FileField
  | JoinField;

export type Fields = Record<string, Field>;

/** A field that stores ids: `relation`, and `image` and `file`, which point to the media library. */
export type RefField = RelationField | ImageField | FileField;

/** A field with a stored value: every field but `join`. */
export type StoredField = Exclude<Field, JoinField>;

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
