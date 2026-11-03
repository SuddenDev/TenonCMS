import { resolve } from "node:path";
import { defineCms } from "tenoncms";
import { libsql } from "tenoncms/libsql";
import { ExamplePlugin } from "tenoncms/plugins/example";
import { ipx } from "tenoncms/media/ipx";
import { local } from "tenoncms/media/local";
import { pagesPreset } from "tenoncms/presets";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts },
  presets: [
    // Headless: no site renders the pages, so there is no permalink and no preview button.
    pagesPreset({
      permalink: undefined,
      seo: true,
      blocks: { text: { label: "Text", fields: { body: { type: "textarea" } } } },
    }),
  ],
  media: {
    storage: local({ dir: resolve(".uploads") }),
    maxSize: 5 * 1024 ** 3,
    images: { provider: ipx() },
  },
  plugins: [ExamplePlugin()],
  database: libsql(process.env.DATABASE_URL ?? "file:./cms.db"),
  secret: process.env.CMS_SECRET!,
});
