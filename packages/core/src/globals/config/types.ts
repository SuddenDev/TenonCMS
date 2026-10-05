import type { Nav } from "../../admin/index.d.ts";
import type { Preview } from "../../preview/config/types.ts";
import type { Fields } from "../../schema/fields/index.ts";
import type { GlobalHooks } from "../../schema/hooks/index.ts";

export type Global<F extends Fields = Fields> = {
  /** Name in the admin. Defaults to the global key. */
  label?: string;
  /** Short text under the name, e.g. on the Settings page and above the form. */
  description?: string;
  /** Placement in the admin navigation. Defaults to the sidebar. */
  nav?: Nav;
  /** The fields that make up this global. */
  fields: F;
  /** The page that shows this global in the admin's live preview, usually `'/'`. See {@link Preview}. */
  preview?: Preview;
  /** The global keeps a draft next to the published data, saved with `{ draft: true }` and published with `publishGlobal()`. Default `true`. */
  drafts?: boolean;
  /** Functions that run on every read and write of this global. Typed only through `defineGlobal()`. */
  hooks?: GlobalHooks<F>;
};
