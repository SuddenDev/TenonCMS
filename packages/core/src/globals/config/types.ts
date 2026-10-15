import type { Nav, Text } from "../../admin/index.d.ts";
import type { Preview } from "../../preview/config/types.ts";
import type { Fields } from "../../schema/fields/index.ts";
import type { GlobalHooks } from "../../schema/hooks/index.ts";

export type Global<F extends Fields = Fields> = {
  /** Name in the admin. Defaults to the global key. */
  label?: Text;
  /** Short text under the name, e.g. on the Settings page and above the form. */
  description?: Text;
  /** Placement in the admin navigation. Defaults to the sidebar. */
  nav?: Nav;
  /** The fields that make up this global. */
  fields: F;
  /** Template of the global's public URL, usually `'/'`. The host's routes MUST serve it. `preview` defaults to it. See {@link Preview}. */
  permalink?: Preview;
  /** The page of a document in the admin's live preview. Defaults to `permalink`. See {@link Preview}. */
  preview?: Preview;
  /** Enable localization for this global. Default `false`. Fields can be overriden with `localized: false` to selecitvly disable localization. */
  localized?: boolean;
  /** The global keeps a draft next to the published data, saved with `{ draft: true }` and published with `publishGlobal()`. Default `true`. */
  drafts?: boolean;
  /** Functions that run on every read and write of this global. Typed only through `defineGlobal()`. */
  hooks?: GlobalHooks<F>;
};
