import type { Core } from "../cms/runtime/types.ts";
import { outerScope } from "../cms/runtime/operation-context.ts";

// Settings are site configuration, so they read without access rules.
const settingsApi = (core: Core) => core.localApi(outerScope({ user: null }, true));

/**
 * The site URL that sitemap and robots URLs resolve against: the `url` of the `general` settings, then the `site`
 * option, then `origin`. `undefined` when none is set.
 */
export async function siteUrl(core: Core, site?: string, origin?: string) {
  const general = core.schema.globals.general && (await settingsApi(core).getGlobal("general"));
  return (typeof general?.url === "string" && general.url) || site || origin;
}

/** Whether the `seo` settings keep the whole site out of search engines. */
export async function isSiteNoindex(core: Core) {
  return !!core.schema.globals.seo && (await settingsApi(core).getGlobal("seo")).noindex === true;
}
