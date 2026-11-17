import type { Core } from "../cms/runtime/types.ts";
import { outerScope } from "../cms/runtime/operation-context.ts";

// Settings are site configuration, so they read without access rules.
const settingsApi = (core: Core) => core.localApi(outerScope({ user: null, overrideAccess: true }));

/** Whether the `seo` settings keep the whole site out of search engines. */
export async function isSiteNoindex(core: Core) {
  return !!core.schema.globals.seo && (await settingsApi(core).getGlobal("seo")).noindex === true;
}
