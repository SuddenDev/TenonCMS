import { defineCms } from "tenoncms";
import { posts } from "./cms/collections/posts";
import { libsql } from "tenoncms/libsql";
import { local } from "tenoncms/media/local";

export default defineCms({
  secret: process.env.TENON_SECRET!,
  database: libsql({
    url: process.env.DATABASE_URL ?? "file:./cms.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  }),
  media: {
    storage: local({ dir: ".uploads" }),
  },
  site: { url: process.env.TENON_SITE_URL, name: "Headless CMS" },
  auth: { baseURL: process.env.TENON_CMS_URL },
  collections: { posts },
});
