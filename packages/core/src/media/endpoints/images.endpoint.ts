import { publishedMedia } from "../../access/read.ts";
import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { notFound } from "../../http/errors.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import { hasVariants } from "../images/decorate.ts";
import { parseImgPath } from "../images/parse-image-path.ts";
import { variantKey } from "../variants/keys.ts";
import { renderVariant } from "../variants/render-variants.ts";
import { SAFE } from "./serve-file.ts";

const variantResponse = (body: BodyInit, type: string, length: number) =>
  new Response(body, {
    headers: { ...SAFE, "content-type": type, "content-length": String(length) },
  });

/**
 * Public `GET /img/<modifiers>/<key>`: a stored variant, or one rendered and stored on first request.
 * Mounted only for a provider with `render`. Accepts only modifiers of the allowlist.
 */
export function imagesEndpoints(core: Core) {
  const media = mediaOf(core);
  const { storage, images, allowlist } = media;
  const api = new Hono<Env>();
  if (!images?.provider.render) return api;

  api.get("/img/:path{.+}", async (c) => {
    const parsed = parseImgPath(c.req.param("path"));
    if (!parsed || !allowlist.has(parsed.id)) return c.json({ message: "Invalid modifiers" }, 400);
    const doc = await publishedMedia(core, c.req.raw, parsed.key);
    if (!doc || !hasVariants(images, doc)) throw notFound();

    const stored = await storage.get(variantKey(doc.key, parsed.id));
    if (stored) {
      const type = parsed.modifiers.format ? `image/${parsed.modifiers.format}` : doc.mimeType;
      return variantResponse(stored.body, type, stored.size);
    }
    const { data, mimeType } = await renderVariant(media, doc.key, parsed.modifiers, parsed.id);
    return variantResponse(data as BodyInit, mimeType, data.length);
  });

  return api;
}
