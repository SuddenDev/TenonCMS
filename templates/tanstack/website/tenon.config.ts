import { defineCms } from "tenoncms";
import { menuPreset, pagesPreset } from "tenoncms/presets";
import { blocks } from "./cms/blocks";
import { seed } from "./cms/seed";
// @tenon-imports

const cms = defineCms({
  // @tenon-options
  presets: [pagesPreset({ seo: true, blocks }), menuPreset({ name: "mainMenu" })],
  seed: ({ cms: api }) => seed(api, siteName()),
});

// `site.name` above. A function, so the seed reads it once the CMS exists.
function siteName(): string {
  return cms.site.name;
}

export default cms;
