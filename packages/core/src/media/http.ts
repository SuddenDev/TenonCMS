import { type Context, Hono } from "hono";
import type { Core } from "../cms/runtime/types.ts";
import { mediaByKey } from "../db/queries/media/media-by-key.query.ts";
import { type Env, notFound } from "../http/middleware.ts";
import { mediaOf } from "./core.ts";
import { hasVariants, parseImgPath } from "./images.ts";
import { folders, removeMedia, renameFolder, update } from "./library.ts";
import type { Storage } from "./storage/types.ts";
import { abort, complete, create, putPart, uploadOf } from "./upload.ts";
import { regenerate, renderVariant, variantKey } from "./variants.ts";

// A malformed body reads as `{}`, which fails the checks with 400.
const body = (req: { json(): Promise<any> }) => req.json().catch(() => ({}));

// User files MAY be HTML or SVG. They MUST NOT run scripts on the host's origin.
const SAFE = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

/** `bytes=a-b`, `bytes=a-` or `bytes=-n` of a file of `size` bytes. `null` for a range that does not fit. */
function parseRange(header: string, size: number) {
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start <= end && start < size ? { start, end } : null;
}

/** The whole file, or the part `range` asks for. `undefined` for a missing file. */
async function serveFile(storage: Storage, doc: Record<string, any>, range?: string) {
  // With a range, one byte is enough to learn the size.
  const file = await storage.get(doc.key, range ? { start: 0, end: 0 } : undefined);
  if (!file) return undefined;
  const headers = { ...SAFE, "content-type": doc.mimeType, "accept-ranges": "bytes" };
  if (!range)
    return new Response(file.body, {
      headers: { ...headers, "content-length": String(file.size) },
    });
  await file.body.cancel();
  const bytes = parseRange(range, file.size);
  if (!bytes)
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${file.size}` },
    });
  const part = (await storage.get(doc.key, bytes))!;
  return new Response(part.body, {
    status: 206,
    headers: {
      ...headers,
      "content-length": String(bytes.end - bytes.start + 1),
      "content-range": `bytes ${bytes.start}-${bytes.end}/${file.size}`,
    },
  });
}

/** The media routes under `/api/cms/media`: `reads` are public, `writes` need a session. */
export function mediaRoutes(core: Core) {
  const media = mediaOf(core);
  const { storage, images, allowlist } = media;
  const docOf = async (key: string) =>
    key.startsWith(".") ? undefined : mediaByKey(await core.db(), key);

  const reads = new Hono<Env>();
  reads.get("/folders", async (c) => c.json(await folders(core)));

  // No `immutable` caching: keys change when a file moves.
  reads.get("/files/:key{.+}", async (c) => {
    const doc = await docOf(c.req.param("key"));
    const response = doc && (await serveFile(storage, doc, c.req.header("range")));
    if (!response) throw notFound();
    return response;
  });

  const render = images?.provider.render;
  if (images && render)
    reads.get("/img/:path{.+}", async (c) => {
      const parsed = parseImgPath(c.req.param("path"));
      if (!parsed || !allowlist.has(parsed.id))
        return c.json({ message: "Invalid modifiers" }, 400);
      const doc = await docOf(parsed.key);
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

  const writes = new Hono<Env>();
  const scope = (c: Context<Env>) => ({ user: c.var.user, context: {}, nested: false });
  const upload = async (c: Context<Env>) => {
    const row = await uploadOf(core, scope(c), c.req.param("id")!);
    if (!row) throw notFound();
    return row;
  };
  writes.post("/uploads", async (c) =>
    c.json(await create(core, scope(c), await body(c.req)), 201),
  );
  writes.put("/uploads/:id/parts/:n", async (c) => {
    const row = await upload(c);
    const data = c.req.raw.body ?? new Blob([]).stream();
    return c.json(await putPart(core, row, Number(c.req.param("n")), data));
  });
  writes.post("/uploads/:id/complete", async (c) => {
    const row = await upload(c);
    const { parts } = await body(c.req);
    return c.json(await complete(core, scope(c), row, Array.isArray(parts) ? parts : []), 201);
  });
  writes.delete("/uploads/:id", async (c) => {
    await abort(core, scope(c), await upload(c));
    return c.body(null, 204);
  });
  writes.post("/folders/rename", async (c) => {
    const { from, to } = await body(c.req);
    return c.json(await renameFolder(core, scope(c), String(from ?? ""), String(to ?? "")));
  });
  writes.patch("/:id", async (c) => {
    const { alt, filename, folder } = await body(c.req);
    const doc = await update(core, scope(c), c.req.param("id"), { alt, filename, folder });
    if (!doc) throw notFound();
    return c.json(doc);
  });
  if (render)
    writes.post("/:id/regenerate", async (c) => {
      const { force } = await body(c.req);
      const result = await regenerate(core, scope(c), c.req.param("id"), { force: force === true });
      if (!result) throw notFound();
      return c.json(result);
    });
  writes.delete("/:id", async (c) => {
    await removeMedia(core, scope(c), c.req.param("id"));
    return c.body(null, 204);
  });
  return { reads, writes, regenerate: Boolean(render) };
}
