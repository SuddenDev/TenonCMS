import { resolve } from "node:path";
import { defineCms } from "tenoncms";
import { libsql } from "tenoncms/libsql";
import { ExamplePlugin } from "tenoncms/plugins/example";
import { ipx } from "tenoncms/media/ipx";
import { local } from "tenoncms/media/local";
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
