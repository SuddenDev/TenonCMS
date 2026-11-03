import { defineCms } from "tenoncms";
import { libsql } from "tenoncms/libsql";
import { ExamplePlugin } from "tenoncms/plugins/example";
import { ipx } from "tenoncms/media/ipx";
import { local } from "tenoncms/media/local";
import { pagesPreset } from "tenoncms/presets";
import { posts } from "./collections/posts";
import { authors } from "./collections/authors";

const { cmsSecret, databaseUrl, uploadsDir } = useRuntimeConfig();

export default defineCms({
  collections: { authors, posts },
  presets: [
    pagesPreset({
      seo: true,
      localized: true,
      blocks: { text: { label: "Text", fields: { body: { type: "textarea" } } } },
    }),
  ],
  // The default media, with an absolute directory: `nuxt preview` runs from inside .output/.
  media: { storage: local({ dir: uploadsDir }), images: { provider: ipx({ prerender: true }) } },
  plugins: [ExamplePlugin({ renderer: "vue" })],
  database: libsql(databaseUrl),
  localization: { locales: ["en", "de"], defaultLocale: "en", fallback: false },
  secret: cmsSecret,
});
