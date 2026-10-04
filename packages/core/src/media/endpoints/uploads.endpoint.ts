import { Hono, type Context } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { notFound } from "../../http/errors.ts";
import { body, scope } from "./request-context.ts";
import { uploadOf } from "../operations/uploads/get-upload.ts";
import { create } from "../operations/uploads/create.operation.ts";
import { putPart } from "../operations/uploads/put-part.operation.ts";
import { complete } from "../operations/uploads/complete.operation.ts";
import { abort } from "../operations/uploads/abort.operation.ts";

export function uploadsEndpoints(core: Core) {
  const api = new Hono<Env>();
  const upload = async (c: Context<Env>) => {
    const row = await uploadOf(core, scope(c), c.req.param("id")!);
    if (!row) throw notFound();
    return row;
  };
  api.post("/uploads", async (c) => c.json(await create(core, scope(c), await body(c.req)), 201));
  api.put("/uploads/:id/parts/:n", async (c) => {
    const row = await upload(c);
    const data = c.req.raw.body ?? new Blob([]).stream();
    return c.json(await putPart(core, row, Number(c.req.param("n")), data));
  });
  api.post("/uploads/:id/complete", async (c) => {
    const row = await upload(c);
    const { parts } = await body(c.req);
    return c.json(await complete(core, scope(c), row, Array.isArray(parts) ? parts : []), 201);
  });
  api.delete("/uploads/:id", async (c) => {
    await abort(core, scope(c), await upload(c));
    return c.body(null, 204);
  });
  return api;
}
