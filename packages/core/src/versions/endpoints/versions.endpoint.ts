import { Hono, type Context } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { notFound } from "../../http/errors.ts";
import { collectionTarget, globalTarget } from "../../content/targets.ts";
import { collectionOf } from "../../collections/endpoints/get-target.ts";
import { globalOf } from "../../globals/endpoints/get-target.ts";
import { listVersions } from "../operations/list-versions.operation.ts";
import { getVersion } from "../operations/get-version.operation.ts";
import { restoreVersion } from "../operations/restore-version.operation.ts";

const found = <T>(value: T | undefined) => {
  if (value === undefined) throw notFound();
  return value;
};

/**
 * Protected history routes on `/collections/:name/:id/versions` and `/globals/:name/versions`: `GET` lists the
 * versions of `?locale=`, `GET …/:version` reads one, `POST …/:version/restore` writes it back.
 */
export function versionsEndpoint(core: Core) {
  const { collections, globals } = core.schema;
  const collection = (c: Context<Env>) =>
    collectionTarget(collectionOf(collections, c.req.param("name")!).name);
  const global = (c: Context<Env>) => globalTarget(globalOf(globals, c.req.param("name")!).name);

  return new Hono<Env>()
    .get("/collections/:name/:id/versions", async (c) =>
      c.json(
        await listVersions(
          core,
          c.var.user,
          collection(c),
          c.req.param("id"),
          c.req.query("locale"),
        ),
      ),
    )
    .get("/collections/:name/:id/versions/:version", async (c) =>
      c.json(
        found(
          await getVersion(
            core,
            c.var.user,
            collection(c),
            c.req.param("id"),
            c.req.param("version"),
          ),
        ),
      ),
    )
    .post("/collections/:name/:id/versions/:version/restore", async (c) =>
      c.json(
        found(
          await restoreVersion(
            core,
            c.var.user,
            collection(c),
            c.req.param("id"),
            c.req.param("version"),
          ),
        ),
      ),
    )
    .get("/globals/:name/versions", async (c) =>
      c.json(await listVersions(core, c.var.user, global(c), undefined, c.req.query("locale"))),
    )
    .get("/globals/:name/versions/:version", async (c) =>
      c.json(
        found(await getVersion(core, c.var.user, global(c), undefined, c.req.param("version"))),
      ),
    )
    .post("/globals/:name/versions/:version/restore", async (c) =>
      c.json(
        found(await restoreVersion(core, c.var.user, global(c), undefined, c.req.param("version"))),
      ),
    );
}
