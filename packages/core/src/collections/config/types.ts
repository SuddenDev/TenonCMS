import type { Nav } from "../../admin/index.d.ts";
import type { Preview } from "../../preview/config/types.ts";
import type { Fields } from "../../schema/fields/index.ts";
import type { CollectionHooks } from "../../schema/hooks/index.ts";

export type Collection<F extends Fields = Fields> = {
  /** Name in the admin. Defaults to the collection key. */
  label?: string;
  /** Short text under the name, e.g. on the Settings page and above the form. */
  description?: string;
  /** Placement in the admin navigation. Defaults to the sidebar. */
  nav?: Nav;
  fields: F;
  /** Field shown in the admin list view. Defaults to the first field. */
  titleField?: string;
  /** The page of a document in the admin's live preview. See {@link Preview}. */
  preview?: Preview;
  /** Documents keep a draft next to the published data, saved with `{ draft: true }` and published with `publish()`. Default `true`. */
  drafts?: boolean;
  /** Functions that run on every read, write and delete of this collection. Typed only through `defineCollection()`. */
  hooks?: CollectionHooks<F>;
};
