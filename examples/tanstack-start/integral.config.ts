import { defineCms } from "integral-cms";
import { admin } from "./admin";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts, pages },
  database: { url: process.env.DATABASE_URL ?? "file:./cms.db" },
  secret: process.env.CMS_SECRET!,
  admin,
});
