import type { Nav, Text } from "../../admin/index.d.ts";
import type { Preview } from "../../preview/config/types.ts";
import type { Fields } from "../../schema/fields/index.ts";
import type { CollectionHooks } from "../../schema/hooks/index.ts";

export type Collection<F extends Fields = Fields> = {
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
  /** Documents keep a draft next to the published data, saved with `{ draft: true }` and published with `publish()`. Default `true`. */
  drafts?: boolean;
  /** Functions that run on every read, write and delete of this collection. Typed only through `defineCollection()`. */
  hooks?: CollectionHooks<F>;
};
