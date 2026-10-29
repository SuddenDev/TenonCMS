import { attachDatabasePool } from "@vercel/functions";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import {
  AWS_REGION,
  AWS_ROLE_ARN,
  CMS_SECRET,
  DATABASE_URL,
  MEDIA_URL,
  S3_BUCKET_NAME,
} from "astro:env/server";
import { defineCms } from "integral-cms";
import { ipx } from "integral-cms/media/ipx";
import { s3 } from "integral-cms/media/s3";
import { postgres } from "integral-cms/postgres";

const database = postgres(DATABASE_URL);
// Fluid compute suspends idle instances. Their idle clients MUST close first.
attachDatabasePool(database.pool);

export default defineCms({
  database,
  secret: CMS_SECRET,
  // The filesystem is read-only, so the default media on the local disk does not work here.
  media: {
    storage: s3({
      bucket: S3_BUCKET_NAME,
      region: AWS_REGION,
      publicUrl: MEDIA_URL,
      credentials: awsCredentialsProvider({ roleArn: AWS_ROLE_ARN }),
    }),
    images: { provider: ipx({ prerender: true }) },
  },
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
