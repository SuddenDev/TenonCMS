import { defineCms } from "integral-cms";
import { ExamplePlugin } from "integral-cms/plugins/example";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts, pages },
  plugins: [ExamplePlugin({ renderer: "react" })],
  database: { url: process.env.DATABASE_URL ?? "file:./cms.db" },
  secret: process.env.CMS_SECRET!,
});
