import type { AnyExtension, Editor, Extensions } from "@tiptap/core";
import type { ClientRef, Text } from "../../admin/index.d.ts";
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
  client: ClientRef<RichtextBrowserExtension>;
};
/** Registrations are keyed by the feature name used in a field's `allowed` list. */
export type RichtextOptions = { extensions?: Record<string, RichtextRegistration> };
