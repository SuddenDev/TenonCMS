# Media

Every instance has a media library: uploads into folders, `image` and `file` fields, and responsive images. Files live on the local disk, in S3 or any S3-compatible service, or in R2 (with keys, or through a Workers binding).

## Setup

Without a `media` option, or with `media: true`, files go to `./.uploads` and images get WebP variants at quality 85, rendered at upload. That is `local({ dir: resolve('.uploads') })` and `ipx({ prerender: true })`. `media: false` turns the library off.

For your own storage, limits or images, pass an object:

```ts
import { defineCms } from "tenoncms";
import { local } from "tenoncms/media/local";
import { ipx } from "tenoncms/media/ipx";

export default defineCms({
  // ...
  media: {
    storage: local({ dir: "/var/lib/my-site/uploads" }),
    maxSize: 5 * 1024 ** 3,
    accept: ["image/*", "video/*", "application/pdf"],
    images: {
      provider: ipx(),
      presets: { avatar: { width: 128, height: 128, fit: "cover" } },
    },
    hooks: { afterUpload: [scan] },
  },
});
```

| Option                            | Default                        | What it does                                       |
| --------------------------------- | ------------------------------ | -------------------------------------------------- |
| `storage`                         | required                       | `local()`, `s3()`, `r2()`, or your own adapter     |
| `maxSize`                         | 100 MB                         | Largest accepted file                              |
| `accept`                          | all types                      | Allowed MIME types, `type/*` wildcards allowed     |
| `images`                          | `false`                        | Responsive variants, or `false` for originals only |
| `images.provider`                 | required with `images`         | `ipx()`, `cloudflare()`, or your own               |
| `images.format`, `images.quality` | `'webp'`, `85`                 | Default modifiers                                  |
| `images.sizes`                    | `[320, 640, 1024, 1536, 1920]` | Widths for `srcset`                                |
| `images.presets`                  | `{}`                           | Named modifier sets                                |
| `images.maxSize`                  | 50 MB                          | Larger images get dimensions but no variants       |
| `hooks`                           | none                           | Media hooks, see [below](#media-hooks)             |

- With `media: false`, core adds no routes, and `image` and `file` fields throw at startup.
- `media` is a reserved collection, plugin and route name.
- `nuxt preview` runs the server from inside `.output/`, so a relative `./.uploads` lands in the build output. Pass an absolute `dir` there, as the Nuxt example does.
- On Cloudflare Workers (the `workerd` export condition), `tenoncms/media/local`, `tenoncms/media/ipx` and the default throw, because they need a filesystem and sharp. There, no `media` option means no media library, and `media: true` throws. Use `r2()` (or `s3()`) and `cloudflare()`.
- In a read-only working directory, as in serverless functions on Vercel, AWS Lambda or Netlify, the default cannot keep uploads. There too, no `media` option means no media library, and `media: true` throws. Use `s3()` or `r2()` with keys.

## Image and file fields

Fields store the media id like a relation, and reads resolve it:

```ts
hero: { type: 'image', required: true, image: { sizes: [800, 1600], quality: 70 } },
avatar: { type: 'image', maxSize: 2 * 1024 ** 2, image: { preset: 'avatar' } },
gallery: { type: 'image', many: true, onDelete: 'set-null' },
attachments: { type: 'file', many: true, accept: ['application/pdf'] },
download: { type: 'file', folder: 'downloads' },
```

- A populated `image` has `url` (the original), `src`, `srcset`, `width`, `height`, `alt`, `mimeType`, `size`, `folder`, `filename` and `key`. A `file` is the same without `src`, `srcset` and the dimensions. With `populate: false` both are ids.
- `src` and `srcset` come from the field's `image` options: `images.format` and `quality`, then the preset, then the field's own modifiers. Widths at or above the original's are dropped. A fixed `width` without `sizes` gives `1x` / `2x`.
- `accept` and `maxSize` are checked on write against the file (400 on the field). An `image` field takes `image/*` only.
- `onDelete` defaults to `'restrict'`: deleting a used file is a 409 with `references`. `'set-null'` is allowed, `'cascade'` is not.
- `folder` is where "Upload new" in the admin uploads to.
- `populate` and `select` take `true` on an image or file, nothing deeper.

## The media API

Media documents live in the `media` collection. Read them with `find('media')` or `GET /_tenon/collections/media`. Write them only through the media API. Collection and root hooks do not run for `media`.

```ts
const doc = await cms.media.upload(bytes, {
  folder: "blog",
  filename: "hero.jpg",
  mimeType: "image/jpeg",
});
await cms.media.update(doc.id, { alt: "Harbour at dusk" });
await cms.media.update(doc.id, { folder: "blog/2026" }); // moves the file
await cms.media.renameFolder("blog", "news");
await cms.media.delete(doc.id);
```

`client.media` has the same methods over HTTP, plus `folders()`. `client.media.upload(file, { folder, onProgress, signal })` uploads in parts, 4 at a time, and retries a failed part 3 times. The admin uses it, and a site MAY use it too.

- A name that is taken gets a counter on upload (`hero-1.jpg`). A rename never does: a taken name is 400 `Already used`. Names compare case-insensitively.
- Folders are the `folder` strings of their files. A folder exists while it holds a file.
- Storage changes first, then the database, then storage cleanup. A failure leaves at most a stray file, never a document without its file.

## Storage

### Local disk

`local({ dir, partSize = 16 MB, baseUrl? })` keeps files in `dir`, one folder per media folder. Core serves them at `/_tenon/media/files/<key>` (with `Range` support). Set `baseUrl` when your web server serves `dir` itself.

- It needs a persistent disk: Node, Bun or Deno on a server. It does not suit Workers or ephemeral serverless filesystems.
- Parts go through your server. **Every part is one request of up to `partSize`**, so a reverse proxy's body limit (nginx `client_max_body_size`) MUST be larger than `partSize`.

### S3 and R2

`s3({ bucket, region, endpoint?, accessKeyId, secretAccessKey, publicUrl?, partSize = 16 MB })` signs with `aws4fetch`, so it runs on Node and Workers. The browser uploads parts straight to the bucket.

- `publicUrl` is where the bucket is public. File URLs are then `<publicUrl>/<key>`.
- Without `publicUrl`, the bucket stays private. Core serves files at `/_tenon/media/files/<key>`, reading them from the bucket.

- Bucket CORS MUST allow `PUT` from the admin origin and expose the `ETag` header. Without `ETag` an upload fails with a message that names the CORS setting.
- Add a lifecycle rule that aborts incomplete multipart uploads after one day.
- R2: use `r2()` with keys, see [R2](#r2). With `s3()`: `region: 'auto'`, `endpoint: 'https://<account>.r2.cloudflarestorage.com'`.
- Neon object storage: `endpoint` is the project's S3 endpoint, `region` its region. See [Vercel with Neon](frameworks.md#with-neon).
- MinIO: `endpoint: 'http://localhost:9000'` (`docker run -p 9000:9000 minio/minio server /data`).
- Temporary credentials: pass `credentials` instead of the two keys. It is a function that returns `{ accessKeyId, secretAccessKey, sessionToken?, expiration? }`, and core asks it again when the credentials expire within 5 minutes. An AWS S3 bucket from the Vercel Marketplace has no keys; it uses `credentials: awsCredentialsProvider({ roleArn: process.env.AWS_ROLE_ARN! })` from `@vercel/oidc-aws-credentials-provider`.

Files and variants that core serves carry `Cache-Control: public, max-age=300, s-maxage=3600` when media has no `read` rule, so a CDN absorbs most reads. A file that is deleted, moved or replaced under the same name can show for up to an hour. With a `read` rule they carry `private, no-cache`.

### R2

`r2()` from `tenoncms/media/r2` has two modes:

|               | `r2(env.MEDIA, { partSize?, publicUrl? })`                 | `r2({ accountId, region?, bucket, accessKeyId, secretAccessKey, publicUrl?, partSize? })` |
| ------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Through       | A bucket binding (`env` from `cloudflare:workers`)         | R2's S3 API, same as `s3()` with `region: 'auto'`                                         |
| Runs on       | Workers only                                               | Node and Workers                                                                          |
| Keys and CORS | Not needed                                                 | Needed, see [S3 and R2](#s3-and-r2)                                                       |
| `publicUrl`   | Optional. Core serves files at `/_tenon/media/files/<key>` | Optional, as with `s3()`                                                                  |

With the binding:

- `wrangler dev` simulates the bucket.
- Parts go through the Worker and, with `tenonObject()`, through the CMS object. Each part is held in memory, and `partSize` is at least 5 MB, as R2 requires.
- A move reads and writes the file, because bindings cannot copy.

With keys, set `region: 'eu'` for a bucket created with that data location. Requests then go to `<account>.eu.r2.cloudflarestorage.com`.

Unfinished uploads are aborted after 24 hours. An upload can have up to 10 000 parts, and the part size grows for larger files.

## Image providers

- **`ipx({ prerender? })`** from `tenoncms/media/ipx` (`ipx` and sharp come with tenoncms): core renders variants on first request at `/_tenon/media/img/<modifiers>/<key>` and stores them under `.variants/<key>/`. Only modifier sets your config can produce are served. `prerender: true` renders them all right after upload.
- **`cloudflare({ binding?, prerender? })`** from `tenoncms/media/cloudflare`:
  - With `binding: env.IMAGES` (the Images binding), core renders variants through Cloudflare Images like `ipx()` does: at `/_tenon/media/img/<modifiers>/<key>`, stored under `.variants/<key>/`. `wrangler dev` renders them locally.
  - Without it: URLs for Cloudflare's image transformations (`/cdn-cgi/image/...`) on your zone. Core renders nothing.
- **Your own**: an object with `getImage(src, modifiers)` that returns `{ url }`, for imgproxy, Bunny or Vercel. Add `render(key, modifiers, storage)` if core should serve the variants.

SVG and images above `images.maxSize` get the original as `src` and an empty `srcset`.

### After changing image options

Run `cms.media.regenerate()`, or "Regenerate variants" on the admin's Media page. It deletes stored variants the options no longer produce and, with `prerender`, renders missing ones. `force: true` re-renders all of them, for example after a sharp upgrade. `POST /_tenon/media/:id/regenerate` does one file.

It exists only for providers with `render`. With `cloudflare()` without a binding nothing is stored, and new URLs take effect on their own.

## Media hooks

Set them in `media.hooks`, or on plugins as `mediaHooks`. The host's run first, then each plugin's. They receive `cms` and `user` and run in the operation's transaction, except `afterDelete`.

| Hook                           | When                          | Gets                                             | Can                                                   |
| ------------------------------ | ----------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| `beforeUpload`                 | before any bytes              | `data`: `folder`, `filename`, `mimeType`, `size` | return changed `folder` / `filename`; throw to reject |
| `afterUpload`                  | file stored, document created | `doc`, `read()`                                  | throw to delete document and file                     |
| `beforeChange` / `afterChange` | `alt` edits                   | `data` / `doc`                                   | change data; react                                    |
| `beforeMove` / `afterMove`     | filename or folder change     | `doc`, `from`, `to`                              | throw to block; react, for example purge a CDN        |
| `beforeDelete` / `afterDelete` | delete                        | `doc`                                            | throw to block; react after the file is gone          |

`read()` streams the file from storage. With S3 it costs a GET.
