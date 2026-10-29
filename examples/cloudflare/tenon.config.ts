import { CMS_SECRET } from "astro:env/server";
import { env } from "cloudflare:workers";
import { defineCms } from "tenoncms";
import { durableObject } from "tenoncms/cloudflare";
import { cloudflare } from "tenoncms/media/cloudflare";
import { r2 } from "tenoncms/media/r2";

export default defineCms({
  database: durableObject(),
  secret: CMS_SECRET,
  media: { storage: r2(env.MEDIA), images: { provider: cloudflare({ binding: env.IMAGES }) } },
  collections: {
    authors: { fields: { name: { type: "text", required: true } } },
    posts: {
      titleField: "title",
      permalink: "/posts/{slug}",
      fields: {
        title: { type: "text", required: true },
        slug: { type: "slug", from: "title", required: true, unique: true },
        author: { type: "relation", collection: "authors" },
        hero: { type: "image", image: { sizes: [480, 960] } },
        body: { type: "textarea" },
      },
    },
  },
});
