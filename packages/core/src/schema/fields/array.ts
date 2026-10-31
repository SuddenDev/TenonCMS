import type { Text } from "../../admin/index.d.ts";
import type { Base } from "./common.ts";
import type { Fields } from "./index.ts";
import type { Layout } from "./layout.ts";

/** Labels of one item and of the list in the admin. */
export type ItemLabels = {
  /** One item, e.g. `Slide`, in the row header and the add button. Default: `Item`, or `Block` for blocks. */
  singular?: Text;
  /** The list, e.g. `Slides`, as its heading in the admin. Default: the field's `label`. */
  plural?: Text;
};

/** A list of items that share one set of fields. Its validator is built by `dataSchema()` from the items. */
export type ArrayField = Base<Record<string, any>[]> &
  Layout & {
    /**
     * Stores a list of objects. Every item has a stable `id`, filled on write when missing, so `id` MUST NOT be a field
     * of an item. Not filterable. Paths into items use the position: `links.2.label`.
     */
    type: "array";
    /** The fields of each item. Items MAY contain groups, arrays and blocks, but no joins. */
    fields: Fields;
    /** Fewest items. Checked only when the field applies. `required` means at least one. */
    minRows?: number;
    /** Most items. Checked only when the field applies. */
    maxRows?: number;
    /** Admin labels. */
    labels?: ItemLabels;
    /**
     * Admin only. `"tree"` shows the items as collapsible rows that nest, with an edit sheet per item. Default: each item
     * edits inline.
     */
    appearance?: "tree";
  };
