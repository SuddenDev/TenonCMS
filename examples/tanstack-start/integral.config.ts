import { defineCms } from "integral-cms";
import { libsql } from "integral-cms/libsql";
import { ExamplePlugin } from "integral-cms/plugins/example";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts, pages },
  plugins: [ExamplePlugin({ renderer: "react" })],
  database: libsql(process.env.DATABASE_URL ?? "file:./cms.db"),
  secret: process.env.CMS_SECRET!,
});
