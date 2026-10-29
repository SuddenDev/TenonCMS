import { defineCms } from "tenoncms";
import { libsql } from "tenoncms/libsql";
import { ExamplePlugin } from "tenoncms/plugins/example";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts, pages },
  plugins: [ExamplePlugin({ renderer: "react" })],
  database: libsql(process.env.DATABASE_URL ?? "file:./cms.db"),
  secret: process.env.CMS_SECRET!,
});
