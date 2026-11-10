import type { AnyExtension, Editor, Extensions } from "@tiptap/core";
import type { BrowserValue, Text } from "../../admin/index.d.ts";
import type { LinkReference } from "../../links/config/types.ts";

/** A CMS relation inside a Tiptap node or mark. `deleted` is owned by the server. */
export type RichtextReference = LinkReference;
/** A standard Tiptap JSON node or mark. */
export type RichtextNode = {
  type: string;
  attrs?: Record<string, any>;
  text?: string;
  marks?: RichtextNode[];
  content?: RichtextNode[];
};
/** The stored Tiptap document. */
export type RichtextDocument = RichtextNode & { type: "doc" };
/** A built-in feature name, see `RICHTEXT_FEATURES`. */
export type RichtextFeature = (typeof import("../runtime/extensions.ts").RICHTEXT_FEATURES)[number];

/**
 * A CSS class the editor MAY apply. `block` goes on a paragraph or heading (`attrs.class`), `text` on the selected
 * text (a `textClass` mark). `name` is the stored class and MAY hold several, like `'text-lg font-bold'`.
 */
export type RichtextClass = {
  name: string;
  label?: Text;
  on: "block" | "text";
  /**
   * Admin only: CSS that shows the class in the editor and in its menu, because the admin does not load the site's CSS.
   * Property names in camelCase, like Vue's `style`: `{ color: '#c2410c', fontWeight: 600 }`.
   */
  preview?: Record<string, string | number>;
};

/** One plugin toolbar action. */
export type RichtextControl = {
  label: Text;
  run(editor: Editor): void;
  active?(editor: Editor): boolean;
  disabled?(editor: Editor): boolean;
};
/** A browser registration loaded before the editor mounts. */
export type RichtextBrowserExtension = { extensions: Extensions; controls?: RichtextControl[] };
/** Shared schema code MUST work without a browser or editor instance. */
export type RichtextRegistration = {
  schema: AnyExtension | Extensions;
  client: BrowserValue<RichtextBrowserExtension>;
};
/** Registrations are keyed by the feature name used in a field's `allowed` list. */
export type RichtextOptions = { extensions?: Record<string, RichtextRegistration> };
