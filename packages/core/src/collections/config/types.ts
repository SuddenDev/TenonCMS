import type { Nav, Text } from "../../admin/index.d.ts";
import type { Preview } from "../../preview/config/types.ts";
import type { Fields, Layout } from "../../schema/fields/index.ts";
import type { CollectionHooks } from "../../schema/hooks/index.ts";
import type { Access } from "../../access/types.ts";

export type Collection<F extends Fields = Fields> = Layout & {
  /** Name in the admin. Defaults to the collection key. */
  label?: Text;
  /** Short text under the name, e.g. on the Settings page and above the form. */
  description?: Text;
  /** Placement in the admin navigation. Defaults to the sidebar. */
  nav?: Nav;
  /** The fields that make up the collection. */
  fields: F;
  /** Field shown in the admin list view. Defaults to the first field. */
  titleField?: string;
  /** Template / link structure of the document's public URL. The host's routes MUST serve it. Used to generate alternative language urls and as default for the admin preview option {@link Preview} */
  permalink?: Preview;
  /** The page of a document in the admin's live preview. Defaults to `permalink`. See {@link Preview}. */
  preview?: Preview;
  /** Enable localization for this collection. Default `false`. Fields can be overriden with `localized: false` to selecitvly disable localization. */
  localized?: boolean;
  /**
   * Whether the items of groups, arrays and blocks have the same structure in every locale: which items exist, their
   * order, nesting and block type. Values stay per locale. This is the starting default; editors switch it per
   * document, admins per entry in the `translations` settings. Needs `localized`. Default `true`.
   */
  syncStructure?: boolean;
  /** Documents keep a draft next to the published data, saved with `{ draft: true }` and published with `publish()`. Default `true`. */
  drafts?: boolean;
  /**
   * The most versions kept per document and language. Recording one more deletes the oldest. Use `Infinity` to keep
   * every version. Default `100`.
   */
  maxVersions?: number;
  /**
   * Whether editors MAY pick the documents on a page in the visual editor. With `false`, "On this page" leaves them
   * out, and edit mode neither outlines nor opens their bound elements, whatever a page binds with `edit()`. Live
   * preview of unsaved changes still applies. Use it for content that visitors write, like comments. Default `true`.
   */
  visualEditing?: boolean;
  /** Who MAY read, create, update and delete documents. Default: everyone reads published documents, signed-in users do the rest. See {@link Access}. */
  access?: Access;
  /** Functions that run on every read, write and delete of this collection. Typed only through `defineCollection()`. */
  hooks?: CollectionHooks<F>;
};
