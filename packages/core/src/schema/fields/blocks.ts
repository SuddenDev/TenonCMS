import type { IconName } from "../../admin/icons.d.ts";
import type { Text } from "../../admin/index.d.ts";
import type { ItemLabels } from "./array.ts";
import type { Base } from "./common.ts";
import type { Fields } from "./index.ts";
import type { Layout } from "./layout.ts";

/**
 * One item type of a `blocks` field. Reuse a block in several fields by importing the same object, or put it in
 * `defineCms({ blocks })` and use its name. Only a named block can contain itself.
 */
export type Block = Layout & {
  /** Name in the admin's block picker and row header. Defaults to the block's key. */
  label?: Text;
  /** Help text in the admin's block picker. */
  description?: Text;
  /** Lucide icon in the admin's block picker, row header and outline. */
  icon?: IconName;
  /**
   * Picture in the admin's block picker, in place of the icon. A URL the site serves, usually an absolute path like
   * `/blocks/hero.jpg`. It is shown as is, cropped to 16:9.
   */
  image?: string;
  /** The fields of an item of this block. `blockType` and `id` MUST NOT be among them. */
  fields: Fields;
};

/** A list of items where each item picks its fields by its block. Its validator is built by `dataSchema()` from the items. */
export type BlocksField = Base<Record<string, any>[]> & {
  /**
   * Stores a list of objects. Every item has a stable `id`, filled on write when missing, and its block's key in
   * `blockType`. Not filterable. Paths into items use the position: `content.2.title`.
   */
  type: "blocks";
  /**
   * The item types, keyed by the name stored in `blockType`. MUST NOT be empty. A value is the block itself, or the name
   * of a shared block in `defineCms({ blocks })`: `{ section: "section" }`. A list of names is short for names stored
   * under the same key: `["section", "text"]`.
   */
  blocks: Record<string, Block | string> | readonly string[];
  /** Fewest items. Checked only when the field applies. `required` means at least one. */
  minRows?: number;
  /** Most items. Checked only when the field applies. */
  maxRows?: number;
  /** Admin labels. */
  labels?: ItemLabels;
};
