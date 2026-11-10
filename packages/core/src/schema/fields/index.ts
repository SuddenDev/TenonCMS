import type { RichtextField } from "./richtext.ts";
import type { LinkField } from "./link.ts";
import type { ArrayField, ItemLabels } from "./array.ts";
import type { BooleanField } from "./boolean.ts";
import type { Block, BlocksField } from "./blocks.ts";
import type { CustomField } from "./custom.ts";
import type { DateField } from "./date.ts";
import type { DateTimeField } from "./datetime.ts";
import type { FileField, MediaFieldOptions } from "./file.ts";
import type { GroupField } from "./group.ts";
import type { ImageField, ImageOptions, Modifiers } from "./image.ts";
import type { JoinField } from "./join.ts";
import type { Fieldset, Layout, Placement, Tab } from "./layout.ts";
import type { NumberField } from "./number.ts";
import type { RelationField } from "./relation.ts";
import type { SelectField, SelectOption } from "./select.ts";
import type { SizeField, SizeValue } from "./size.ts";
import type { SlugField } from "./slug.ts";
import type { TextField } from "./text.ts";

export type { Base, Common } from "./common.ts";
export type {
  ArrayField,
  ItemLabels,
  Block,
  BlocksField,
  BooleanField,
  CustomField,
  DateField,
  DateTimeField,
  FileField,
  GroupField,
  ImageField,
  ImageOptions,
  MediaFieldOptions,
  Modifiers,
  JoinField,
  LinkField,
  Fieldset,
  Layout,
  Placement,
  Tab,
  NumberField,
  RelationField,
  SelectField,
  SelectOption,
  SizeField,
  SizeValue,
  SlugField,
  TextField,
  RichtextField,
};

/** One field of a collection, a global or a group. `type` picks the kind of value. */
export type Field =
  | RichtextField
  | LinkField
  | TextField
  | DateField
  | DateTimeField
  | NumberField
  | SizeField
  | BooleanField
  | SelectField
  | CustomField
  | SlugField
  | GroupField
  | ArrayField
  | BlocksField
  | RelationField
  | ImageField
  | FileField
  | JoinField;

export type Fields = Record<string, Field>;

/** A field that stores ids: `relation`, and `image` and `file`, which point to the media library. */
export type RefField = RelationField | ImageField | FileField;

/** A field with a stored value: every field but `join`. */
export type StoredField = Exclude<Field, JoinField>;
