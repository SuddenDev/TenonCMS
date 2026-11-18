import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { publishedMedia } from "../../access/read.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { notFound } from "../../http/errors.ts";
import { isRaster } from "../images/decorate.ts";
import { setThumbnail } from "../operations/set-thumbnail.operation.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import { variantKey } from "../variants/keys.ts";
import {
  invalidThumbnail,
  THUMBNAIL,
  THUMBNAIL_MAX_BYTES,
  thumbnailType,
} from "../variants/thumbnail.ts";
import { scope } from "./request-context.ts";
import { mediaCacheControl, SAFE } from "./serve-file.ts";

/**
 * Public `GET /thumbnail/<key>`: the admin's preview of an image, or a redirect to the original while there is none.
 * Mounted only without `media.images`.
 */
export function thumbnailFileEndpoints(core: Core) {
  const { images, storage } = mediaOf(core);
  const api = new Hono<Env>();
  if (images) return api;

  api.get("/thumbnail/:key{.+}", async (c) => {
    const doc = await publishedMedia(core, c.req.raw, c.req.param("key"));
    if (!doc || !isRaster(doc)) throw notFound();
    const stored = await storage.get(variantKey(doc.key, THUMBNAIL));
    if (!stored) return c.redirect(storage.url(doc.key), 302);

    const data = new Uint8Array(await new Response(stored.body).arrayBuffer());
    return new Response(data, {
      headers: {
        ...SAFE,
        "content-type": thumbnailType(data) ?? "application/octet-stream",
        "content-length": String(data.length),
        "cache-control": mediaCacheControl(core),
      },
    });
  });
  return api;
}

/** Protected `PUT /:id/thumbnail` with the thumbnail's bytes as the body. Mounted only without `media.images`. */
export function thumbnailWriteEndpoints(core: Core) {
  const api = new Hono<Env>();
  if (mediaOf(core).images) return api;

  const limit = bodyLimit({
    maxSize: THUMBNAIL_MAX_BYTES,
    onError: () => {
      throw invalidThumbnail();
    },
  });
  api.put("/:id/thumbnail", limit, async (c) => {
    const data = new Uint8Array(await c.req.arrayBuffer());
    const doc = await setThumbnail(core, scope(c), c.req.param("id"), data);
    if (!doc) throw notFound();
    return c.json(doc);
  });
  return api;
}
