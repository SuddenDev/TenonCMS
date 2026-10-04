import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { notFound } from "../../http/errors.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import { docOf } from "./get-file.ts";
import { SAFE } from "./file-headers.ts";
import { hasVariants } from "../images/decorate.ts";
import { parseImgPath } from "../images/parse-image-path.ts";
import { variantKey } from "../variants/keys.ts";
import { renderVariant } from "../variants/render-variant.ts";

export function imagesEndpoints(core: Core) {
  const media = mediaOf(core);
  const { storage, images, allowlist } = media;
  const api = new Hono<Env>();
  const render = images?.provider.render;
  if (images && render)
    api.get("/img/:path{.+}", async (c) => {
      const parsed = parseImgPath(c.req.param("path"));
      if (!parsed || !allowlist.has(parsed.id))
        return c.json({ message: "Invalid modifiers" }, 400);
      const doc = await docOf(core, parsed.key);
      if (!doc || !hasVariants(images, doc)) throw notFound();
      const variant = variantKey(doc.key, parsed.id);
      const type = parsed.modifiers.format ? `image/${parsed.modifiers.format}` : doc.mimeType;
      const stored = await storage.get(variant);
      if (stored)
        return new Response(stored.body, {
          headers: { ...SAFE, "content-type": type, "content-length": String(stored.size) },
        });
      const { data, mimeType } = await renderVariant(media, doc.key, parsed.modifiers, parsed.id);
      return new Response(data as BodyInit, {
        headers: { ...SAFE, "content-type": mimeType, "content-length": String(data.length) },
      });
    });

  return api;
}
