import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { parseBody } from "../../http/parse-body.ts";
import { input } from "../../users/endpoints/input.ts";
import { collectionTarget, globalTarget } from "../../content/targets.ts";
import { collectionOf } from "../../collections/endpoints/get-target.ts";
import { globalOf } from "../../globals/endpoints/get-target.ts";
import { lockTarget } from "../operations/lock-target.operation.ts";
import { unlockTarget } from "../operations/unlock-target.operation.ts";

const claimBody = z.object({ takeover: z.boolean().optional() });
const takeover = async (c: Context<Env>) =>
  input(claimBody, await parseBody(c.req)).takeover ?? false;

/**
 * Protected edit lock routes: `POST` claims or renews, `DELETE` frees, on `/collections/:name/:id/lock` and
 * `/globals/:name/lock`. The body MAY hold `{ takeover: true }`.
 */
export function locksEndpoint(core: Core) {
  const { collections, globals } = core.schema;
  const collection = (c: Context<Env>) =>
    collectionTarget(collectionOf(collections, c.req.param("name")!).name);
  const global = (c: Context<Env>) => globalTarget(globalOf(globals, c.req.param("name")!).name);

  return new Hono<Env>()
    .post("/collections/:name/:id/lock", async (c) =>
      c.json(
        await lockTarget(core, c.var.user, collection(c), c.req.param("id"), await takeover(c)),
      ),
    )
    .delete("/collections/:name/:id/lock", async (c) => {
      await unlockTarget(core, c.var.user, collection(c), c.req.param("id"));
      return c.body(null, 204);
    })
    .post("/globals/:name/lock", async (c) =>
      c.json(await lockTarget(core, c.var.user, global(c), undefined, await takeover(c))),
    )
    .delete("/globals/:name/lock", async (c) => {
      await unlockTarget(core, c.var.user, global(c), undefined);
      return c.body(null, 204);
    });
}
