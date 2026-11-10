import { attachDatabasePool } from "@vercel/functions";
import {
  AWS_ACCESS_KEY_ID,
  AWS_ENDPOINT_URL_S3,
  AWS_REGION,
  AWS_SECRET_ACCESS_KEY,
  CMS_SECRET,
  DATABASE_URL,
  DEPLOY_HOOK_URL,
  S3_BUCKET,
} from "astro:env/server";
import { defineCms } from "tenoncms";
import { ipx } from "tenoncms/media/ipx";
import { s3 } from "tenoncms/media/s3";
import { postgres } from "tenoncms/postgres";
import { deploy } from "./src/deploy/plugin.ts";

const database = postgres(DATABASE_URL);
// Fluid compute suspends idle instances. Their idle clients MUST close first.
attachDatabasePool(database.pool);

export default defineCms({
  database,
  secret: CMS_SECRET,
  // The post pages are prerendered. Without a deploy hook there is no Deploy button.
  plugins: DEPLOY_HOOK_URL ? [deploy(DEPLOY_HOOK_URL)] : [],
  // The filesystem is read-only, so the default media on the local disk does not work here.
  media: {
    // Without `publicUrl`, the bucket stays private and core serves its files.
    storage: s3({
      bucket: S3_BUCKET,
      region: AWS_REGION,
      endpoint: AWS_ENDPOINT_URL_S3,
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    }),
    images: { provider: ipx({ prerender: true }) },
  },
  collections: {
    authors: { fields: { name: { type: "text", required: true } } },
    posts: {
      titleField: "title",
      permalink: "/posts/{slug}",
      // The admin previews the per-request twin of the prerendered page.
      preview: "/preview/posts/{slug}",
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
