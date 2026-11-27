# Media

Every instance has a media library: uploads into folders, `image` and `file` fields, and responsive images. Files live on the local disk, in S3 or any S3-compatible service, or in R2 (with keys, or through a Workers binding).

## Setup

Without a `media` option, or with `media: true`, files go to `./.uploads` and images are served as uploaded. That is `local({ dir: resolve('.uploads') })` without `images`. For resized WebP variants, add an [image provider](#image-providers). `media: false` turns the library off.

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
| `images.provider`                 | required with `images`         | One of the [providers](#image-providers), or yours |
| `images.format`, `images.quality` | `'webp'`, `85`                 | Default modifiers                                  |
| `images.sizes`                    | `[320, 640, 1024, 1536, 1920]` | Widths for `srcset`                                |
| `images.presets`                  | `{}`                           | Named modifier sets                                |
| `images.maxSize`                  | 50 MB                          | Larger images get dimensions but no variants       |
| `hooks`                           | none                           | Media hooks, see [below](#media-hooks)             |

- With `media: false`, core adds no routes, and `image` and `file` fields throw at startup.
- `media` is a reserved collection, plugin and route name.
- `nuxt preview` runs the server from inside `.output/`, so a relative `./.uploads` lands in the build output. Pass an absolute `dir` there, as the Nuxt example does.
- On Cloudflare Workers (the `workerd` export condition), `tenoncms/media/local`, `tenoncms/media/ipx` and the default throw, because they need a filesystem and sharp. There, no `media` option means no media library, and `media: true` throws. Use `r2()` (or `s3()`) and `cloudflare()` or a hosted provider.
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

- A populated `image` has `url` (the original), `src`, `srcset`, `thumbnail` (only [without a provider](#without-a-provider)), `width`, `height`, `alt`, `mimeType`, `size`, `folder`, `filename` and `key`. A `file` is the same without `src`, `srcset` and the dimensions. With `populate: false` both are ids.
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

Without `images`, every image is served as uploaded. A provider adds resized variants and a `srcset`. Each one is its own entry, `tenoncms/media/<name>`, so a site loads only the one it uses. `npm create tenoncms` asks for one.

Two kinds exist. A **rendering** provider makes the variants itself; core serves them at `/_tenon/media/img/<modifiers>/<key>` and stores them under `.variants/<key>/`. Only modifier sets your config can produce are served, and `prerender: true` renders them all right after upload. A **URL** provider only builds URLs for an image service; core renders and stores nothing.

| Provider                                      | Kind                      | Runs on                                                  | Modifiers it ignores                            |
| --------------------------------------------- | ------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `ipx({ prerender? })`                         | rendering, sharp          | Node, Bun, Vercel functions                              | none                                            |
| `cloudflare({ binding, prerender? })`         | rendering, Images binding | Cloudflare Workers                                       | none                                            |
| `cloudflare()`                                | URL, `/cdn-cgi/image/…`   | any site on a Cloudflare zone with image transformations | none                                            |
| `vercel({ sizes? })`                          | URL, `/_vercel/image`     | Vercel                                                   | `height`, `fit`, `format`, `background`, `blur` |
| `netlify({ baseURL? })`                       | URL, `/.netlify/images`   | Netlify, `netlify dev`                                   | `background`, `blur`                            |
| `imgix({ baseURL })`                          | URL                       | anywhere                                                 | none                                            |
| `cloudinary({ baseURL, origin? })`            | URL                       | anywhere                                                 | none                                            |
| `imagekit({ baseURL })`                       | URL                       | anywhere                                                 | none                                            |
| `bunny({ baseURL })`                          | URL                       | anywhere                                                 | `fit`, `format`, `background`                   |
| `imgproxy({ baseURL, key?, salt?, origin? })` | URL, self-hosted          | anywhere                                                 | none                                            |
| `thumbor({ baseURL, key?, origin? })`         | URL, self-hosted          | anywhere                                                 | none                                            |

```ts
import { imgix } from "tenoncms/media/imgix";

media: {
  storage: s3({ /* … */ }),
  images: { provider: imgix({ baseURL: "https://my-site.imgix.net" }) },
},
```

- **`ipx()`** needs `ipx` installed: `npm install ipx@4.0.0-beta.1`. `tenoncms` does not install it, because sharp is a large native package.
- **`cloudflare()`**: with `binding: env.IMAGES`, core renders through Cloudflare Images, and `wrangler dev` renders locally. Without a binding, URLs go to `/cdn-cgi/image/` on the zone that serves the site, so the site MUST be proxied by Cloudflare with image transformations on. That works for a Node or Vercel site too.
- **imgix, ImageKit, Bunny, Cloudinary** (`…/image/upload`): the URL is `<baseURL>/<key>`. Point the service's origin at the bucket, or at `https://<site>/_tenon/media/files/` for local files. Cloudinary's `baseURL` is `https://res.cloudinary.com/<cloud>/image/upload/<folder>` with an auto-upload mapping of `<folder>`, or `…/image/upload` for files you uploaded to Cloudinary yourself (the key without its extension is the public id). `…/image/fetch` fetches the file URL instead; `origin` makes local URLs absolute.
- **imgproxy and Thumbor** load the file URL. Set `IMGPROXY_BASE_URL` on imgproxy, or pass `origin` (the site, e.g. `https://example.com`) so local URLs are absolute. With `key` and `salt` (hex) imgproxy URLs are signed, and with `key` Thumbor URLs are. Without them they are `unsafe`, which the server MUST allow.
- **Netlify**: a file on another origin, such as a bucket, MUST be listed in `remote_images` of `netlify.toml`.
- **Your own**: an object with `getImage(src, modifiers)` that returns `{ url }`. Add `render(key, modifiers, storage)` if core should serve the variants. The URL providers port the mappings of [Nuxt Image](https://image.nuxt.com/providers), so other Nuxt Image providers translate the same way.

### Vercel

`vercel()` returns the originals outside Vercel, so development needs nothing. On Vercel, Image Optimization MUST be enabled with the same widths as `images.sizes` (default `[320, 640, 1024, 1536, 1920]`). A width in between is rounded up to the next allowed one. Vercel picks the format itself.

- Astro: `adapter: vercel({ imagesConfig: { sizes: [320, 640, 1024, 1536, 1920], domains: [] } })`.
- Nuxt, TanStack Start and standalone (Nitro): `vercel: { config: { images: { sizes: [320, 640, 1024, 1536, 1920] } } }` in the Nitro config, which is `nitro` in `nuxt.config.ts`.
- Files in a bucket: set `publicUrl` on `s3()`, and allow its host in `remotePatterns` of the same `images` block.

SVG and images above `images.maxSize` get the original as `src` and an empty `srcset`.

### Without a provider

Images are served as uploaded, so your site can render them with its own tools: Nuxt Image or Astro's `<Image>` take `url`, `width` and `height` of a populated image. Keep in mind that their default optimizers use sharp too.

The admin then makes its own small previews, so the media grid does not load every original. On upload, the browser draws each raster image at 320 px on the short side (at most 1024 px on the long side) and stores it as WebP, or JPEG in browsers without a WebP encoder. No package, no work on the server.

- Reads of raster images get `thumbnail`: `/_tenon/media/thumbnail/<key>`. It redirects to the original until the thumbnail exists, for example for a HEIC file the browser cannot decode, or a file from `cms.media.upload()` or an import.
- "Create missing previews" in the Media page's menu makes the missing ones, for example after an import, from files uploaded before this feature, or after you turn a provider off. A file the browser cannot fetch, such as one in a bucket without CORS, keeps showing the original.
- `cms.media.setThumbnail(id, bytes)` and `PUT /_tenon/media/:id/thumbnail` store one. They need `media.access.update` and take a WebP or JPEG of at most 200 KB and 1024 px per side.
- Thumbnails move and are deleted with their file. Once you set a provider, regenerating deletes them like any variant the options no longer produce.

### After changing image options

Run `npx tenon media regenerate` in the project, or `cms.media.regenerate()` from your own code. It deletes stored variants the options no longer produce and, with `prerender`, renders missing ones. `--force` (`force: true`) renders all of them again, for example after a sharp upgrade. `POST /_tenon/media/:id/regenerate` does one file. A restore with media files runs it for you.

The CLI loads `tenon.config.ts` and renders with your storage, so a config that runs only on Cloudflare calls `cms.media.regenerate()` there, for example from a route or a job. Without a provider it only deletes leftover variants and tells you how many previews are missing; the admin makes those.

It works with rendering providers and without a provider, where it keeps only the thumbnails and reports the missing ones as `needsThumbnail`. With a URL provider nothing is stored, and new URLs take effect on their own.

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
