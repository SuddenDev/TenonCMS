import { resolve } from "node:path";
import { defineCms } from "integral-cms";
import { libsql } from "integral-cms/libsql";
import { ExamplePlugin } from "integral-cms/plugins/example";
import { ipx } from "integral-cms/media/ipx";
import { local } from "integral-cms/media/local";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts, pages },
  media: {
    storage: local({ dir: resolve(".uploads") }),
    maxSize: 5 * 1024 ** 3,
    images: { provider: ipx() },
  },
  plugins: [ExamplePlugin()],
  database: libsql(process.env.DATABASE_URL ?? "file:./cms.db"),
  secret: process.env.CMS_SECRET!,
});
