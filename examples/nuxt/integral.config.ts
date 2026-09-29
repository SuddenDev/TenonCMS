import { defineCms } from "integral-cms";
import { ipx } from "integral-cms/media/ipx";
import { local } from "integral-cms/media/local";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";
import { authors } from "./collections/authors";

const { cmsSecret, databaseUrl, uploadsDir } = useRuntimeConfig();

export default defineCms({
  collections: { authors, posts, pages },
  // The default media, with an absolute directory: `nuxt preview` runs from inside .output/.
  media: { storage: local({ dir: uploadsDir }), images: { provider: ipx({ prerender: true }) } },
  database: { url: databaseUrl },
  secret: cmsSecret,
});
