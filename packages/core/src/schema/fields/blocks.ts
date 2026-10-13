import type { IconName } from "../../admin/icons.d.ts";
import type { ItemLabels } from "./array.ts";
import type { Base } from "./common.ts";
import type { Fields } from "./index.ts";

/** One item type of a `blocks` field. Reuse a block in several fields by importing the same object. */
export type Block = {
  /** Name in the admin's block picker and row header. Defaults to the block's key. */
  label?: string;
  /** Help text in the admin's block picker. */
  description?: string;
  /** Lucide icon in the admin's block picker. */
  icon?: IconName;
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
  /** The item types, keyed by the name stored in `blockType`. MUST NOT be empty. */
  blocks: Record<string, Block>;
  /** Fewest items. Checked only when the field applies. `required` means at least one. */
  minRows?: number;
  /** Most items. Checked only when the field applies. */
  maxRows?: number;
  /** Admin labels. */
  labels?: ItemLabels;
};
