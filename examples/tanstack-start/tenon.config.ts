import { defineCms } from "tenoncms";
import { libsql } from "tenoncms/libsql";
import { ExamplePlugin } from "tenoncms/plugins/example";
import { pagesPreset } from "tenoncms/presets";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts },
  presets: [
    pagesPreset({
      seo: true,
      blocks: { text: { label: "Text", fields: { body: { type: "textarea" } } } },
    }),
  ],
  plugins: [ExamplePlugin({ renderer: "react" })],
  database: libsql(process.env.DATABASE_URL ?? "file:./cms.db"),
  secret: process.env.CMS_SECRET!,
});
