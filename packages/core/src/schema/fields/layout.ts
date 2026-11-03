import type { IconName } from "../../admin/icons.d.ts";
import type { Text } from "../../admin/index.d.ts";

/** One tab of a tab bar in the admin. */
export type Tab = {
  /** Text of the tab. Defaults to its key. */
  label?: Text;
  /** Lucide icon before the label. */
  icon?: IconName;
};

/** A box around some fields in the admin. It stores nothing. */
export type Fieldset = {
  /** Heading of the box. Defaults to its key. */
  label?: Text;
  /** Help text below the heading. */
  description?: Text;
  /** The heading opens and closes the box. Default `false`. */
  collapsible?: boolean;
  /** A collapsible box starts closed. Default `false`. */
  collapsed?: boolean;
};

/**
 * Admin layout of a set of fields: a collection, a global, a group, an array item or a block. Only the admin reads it;
 * the stored data keeps its shape.
 */
export type Layout = {
  /**
   * A tab bar for these fields, keyed by the name a field gives in `tab`. Fields without `tab` show above the bar.
   * The first tab is open at first. A group, array item or block MAY have its own tab bar.
   */
  tabs?: Record<string, Tab>;
  /** Boxes around fields, keyed by the name a field gives in `fieldset`. A box shows where its first field is. */
  fieldsets?: Record<string, Fieldset>;
};

/** Admin only options of every field that place it in the admin. */
export type Placement = {
  /** The tab of the nearest `tabs` that shows this field. A list shows it in each of them. */
  tab?: string | readonly string[];
  /** The box of the nearest `fieldsets` that holds this field. Its fields MUST share their tabs. */
  fieldset?: string;
  /** A line across the row above the field, to structure a long form. A text adds a heading above the line. */
  separator?: true | Text;
  /** The share of the row the field takes. Fields next to each other fill a row; in a narrow form every field takes the full width. Default `'full'`. */
  width?: "1/4" | "1/3" | "1/2" | "2/3" | "3/4" | "full";
};
