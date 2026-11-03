import type { SeoTemplates } from "../../helpers/seo-meta.ts";
import type { Base } from "./common.ts";
import type { Fields } from "./index.ts";
import type { Layout } from "./layout.ts";

/** Nested fields. Its validator is built by `dataSchema()` from its fields, because conditions inside depend on the data. */
export type GroupField = Base<Record<string, unknown>> &
  Layout & {
    /** Nests fields under one key, stored as an object. The admin shows it as its own section. Not filterable. */
    type: "group";
    /** The nested fields. Groups MAY contain groups. */
    fields: Fields;
    /** Admin only: `'plain'` shows the fields without the box and heading, e.g. when a tab already names the group. */
    appearance?: "plain";
    /**
     * Admin only: a built-in editor around the fields. `'seo'` adds length hints, Auto-generate buttons, checks and a
     * search preview. The group MUST have the fields of `seo()`. Set by `seo()`.
     */
    editor?: "seo";
    /** Admin only, with `editor: 'seo'`: the collection's title and description templates, for hints and the preview. */
    templates?: SeoTemplates;
  };
