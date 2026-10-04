import type { User } from "better-auth";
import { type Context, Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { API_BASE } from "../client/index.ts";
import type { Cms } from "../index.ts";
import { ConflictError, ValidationError } from "../errors.ts";
import type { Plugin, PublicRouteEnv, RouteEnv } from "../plugins/index.ts";
import { innerFields, mapValue } from "../schema/walk.ts";
import { badSelectPath, type SelectSpec } from "../cms/populate.ts";
import type { Collection, Fields, Global, LocalApi, Schema } from "../schema/index.ts";
import { previewUrl } from "../preview/url.ts";
import {
  caller,
  type Env,
  notFound,
  PREVIEW_COOKIE,
  pluginMiddleware,
  session,
  withCms,
} from "./middleware.ts";
import { type Level, parsePopulate, parseSelect, visible, whereFromQuery } from "./query.ts";

/**
 * `asUser(user)` returns the local API with the session user set for hooks. `media` holds the media routes, mounted at
 * `/media` when the `media` option is set.
 */
export function createApp(
  cms: Cms<Schema>,
  asUser: (user: User) => Cms<Schema>,
  plugins: readonly Plugin[] = [],
  media?: { reads: Hono<Env>; writes: Hono<Env>; regenerate: boolean },
) {
  const { schema } = cms;
  const collections: Record<string, Collection> = schema.collections ?? {};
  // Hooks are functions. `JSON.stringify` turns them into `null` inside arrays, so they are dropped here.
  // A field MAY be named `hooks` or `preview`; it has a `type`. `JSON.stringify` drops other functions, like `validate`, itself.
  // The admin only needs to know that a `preview` exists, so either form is sent as `true`.
  const publicSchema = JSON.parse(
    JSON.stringify(schema, (key, value) =>
      typeof value?.type === "string"
        ? value
        : key === "hooks"
          ? undefined
          : key === "preview"
            ? !!value || undefined
            : value,
    ),
  );
  // What the admin needs to know of the media options.
  if (media) publicSchema.media = { regenerate: media.regenerate };

  // Removes fields the caller cannot see, also in groups, populated relations and joins.
  function strip(fields: Fields, doc: unknown, level: Level): unknown {
    return mapValue(doc, (d) => {
      const out = { ...d };
      for (const [key, f] of Object.entries(fields)) {
        const inner = innerFields(collections, f);
        if (!visible(f, level)) delete out[key];
        else if (inner) out[key] = strip(inner, out[key], level);
      }
      return out;
    });
  }

  // Reads are public. A session sees private fields, and with the preview cookie reads drafts.
  async function reader(request: Request): Promise<{ level: Level; api: Cms<Schema> }> {
    const { user, drafts } = await caller(
      async (headers) => (await cms.auth()).api.getSession({ headers }),
      request,
    );
    return {
      level: user ? "admin" : "public",
      api: drafts ? cms.drafts() : cms,
    };
  }

  // A collection or global named in the URL, or a 404.
  const collectionOf = (name: string) => {
    if (!Object.hasOwn(collections, name)) throw notFound();
    return { name, fields: collections[name].fields };
  };
  const globalOf = (name: string) => {
    const globals = schema.globals ?? {};
    if (!Object.hasOwn(globals, name)) throw notFound();
    return { name, fields: globals[name].fields };
  };
  // The preview URL of an entry with `preview`, or a 404.
  const preview = async (entry: Collection | Global, c: Context<Env>) => {
    if (!entry.preview) throw notFound();
    return { url: await previewUrl(entry, await body(c.req), c.var.cms as unknown as LocalApi) };
  };
  // Mounts each plugin's routes of one kind under its name.
  const mount = (into: Hono<Env>, kind: "routes" | "publicRoutes") => {
    for (const plugin of plugins) {
      // Both kinds get a sub-app that satisfies their environment.
      const add = plugin[kind] as ((api: Hono<RouteEnv & PublicRouteEnv>) => void) | undefined;
      if (!add) continue;
      const sub = new Hono<RouteEnv & PublicRouteEnv>();
      add(sub);
      into.route(`/${plugin.name}`, sub);
    }
  };

  // Public: the site renders this content anyway. Reads use `cms` (no user). Query params are equality filters,
  // except `limit`, `populate`, `depth` and `select`, so fields with these names cannot be filtered over HTTP.
  const reads = new Hono<Env>();
  mount(reads, "publicRoutes");
  if (media) reads.route("/media", media.reads);
  reads.get("/collections/:name", async (c) => {
    const { name, fields } = collectionOf(c.req.param("name"));
    const { limit, populate, depth, select, ...query } = c.req.query();
    const { level, api } = await reader(c.req.raw);
    const where = whereFromQuery(fields, query, level);
    if (!where) return c.json({ message: "Invalid filter" }, 400);
    if (limit !== undefined && !/^[1-9]\d*$/.test(limit))
      return c.json({ message: "Invalid limit" }, 400);
    const read = readOptions(fields, { populate, depth, select });
    if (typeof read === "string") return c.json({ message: read }, 400);
    const docs = await api.find(name, { where, limit: limit ? Number(limit) : undefined, ...read });
    return c.json(strip(fields, docs, level));
  });
  reads.get("/collections/:name/:id", async (c) => {
    const { name, fields } = collectionOf(c.req.param("name"));
    const read = readOptions(fields, c.req.query());
    if (typeof read === "string") return c.json({ message: read }, 400);
    const { level, api } = await reader(c.req.raw);
    const doc = await api.findById(name, c.req.param("id"), read);
    if (!doc) throw notFound();
    return c.json(strip(fields, doc, level));
  });
  reads.get("/globals/:name", async (c) => {
    const { name, fields } = globalOf(c.req.param("name"));
    const read = readOptions(fields, c.req.query(), false);
    if (typeof read === "string") return c.json({ message: read }, 400);
    const { level, api } = await reader(c.req.raw);
    return c.json(strip(fields, await api.getGlobal(name, read), level));
  });

  // Behind CSRF and a session. Writes use `c.var.cms`, which carries the session user.
  const writes = new Hono<Env>();
  writes.get("/schema", (c) => c.json(publicSchema));
  // The preview cookie holds a perspective. Reads of a signed-in user with `drafts` see drafts.
  // It is not HttpOnly: the preview runtime reads it, and it grants nothing without a session.
  writes.post("/preview", async (c) => {
    const perspective = (await body(c.req))?.perspective ?? "drafts";
    if (perspective !== "drafts" && perspective !== "published")
      return c.json({ message: 'perspective MUST be "drafts" or "published"' }, 400);
    setCookie(c, PREVIEW_COOKIE, perspective, { sameSite: "Lax", path: "/" });
    return c.body(null, 204);
  });
  writes.delete("/preview", (c) => {
    deleteCookie(c, PREVIEW_COOKIE, { path: "/" });
    return c.body(null, 204);
  });
  mount(writes, "routes");
  if (media) writes.route("/media", media.writes);
  writes.post("/collections/:name", async (c) => {
    const { name } = collectionOf(c.req.param("name"));
    return c.json(await c.var.cms.create(name, await body(c.req)), 201);
  });
  writes.post("/collections/:name/draft", async (c) => {
    const { name } = collectionOf(c.req.param("name"));
    return c.json(await c.var.cms.create(name, await body(c.req), { draft: true }), 201);
  });
  writes.post("/collections/:name/preview-url", async (c) => {
    const { name } = collectionOf(c.req.param("name"));
    return c.json(await preview(collections[name]!, c));
  });
  writes.put("/collections/:name/:id", async (c) => {
    const { name } = collectionOf(c.req.param("name"));
    const doc = await c.var.cms.update(name, c.req.param("id"), await body(c.req));
    if (!doc) throw notFound();
    return c.json(doc);
  });
  writes.put("/collections/:name/:id/draft", async (c) => {
    const { name } = collectionOf(c.req.param("name"));
    const doc = await c.var.cms.update(name, c.req.param("id"), await body(c.req), {
      draft: true,
    });
    if (!doc) throw notFound();
    return c.json(doc);
  });
  writes.post("/collections/:name/:id/publish", async (c) => {
    const { name } = collectionOf(c.req.param("name"));
    const doc = await c.var.cms.publish(name, c.req.param("id"));
    if (!doc) throw notFound();
    return c.json(doc);
  });
  // 204 when the document was never published and is deleted.
  writes.delete("/collections/:name/:id/draft", async (c) => {
    const { name } = collectionOf(c.req.param("name"));
    const doc = await c.var.cms.discard(name, c.req.param("id"));
    return doc ? c.json(doc) : c.body(null, 204);
  });
  writes.delete("/collections/:name/:id", async (c) => {
    const { name } = collectionOf(c.req.param("name"));
    await c.var.cms.delete(name, c.req.param("id"));
    return c.body(null, 204);
  });
  writes.post("/globals/:name/preview-url", async (c) => {
    const { name } = globalOf(c.req.param("name"));
    return c.json(await preview(schema.globals![name]!, c));
  });
  writes.put("/globals/:name", async (c) => {
    const { name } = globalOf(c.req.param("name"));
    return c.json(await c.var.cms.setGlobal(name, await body(c.req)));
  });
  writes.put("/globals/:name/draft", async (c) => {
    const { name } = globalOf(c.req.param("name"));
    return c.json(await c.var.cms.setGlobal(name, await body(c.req), { draft: true }));
  });
  writes.post("/globals/:name/publish", async (c) => {
    const { name } = globalOf(c.req.param("name"));
    return c.json(await c.var.cms.publishGlobal(name));
  });
  writes.delete("/globals/:name/draft", async (c) => {
    const { name } = globalOf(c.req.param("name"));
    return c.json(await c.var.cms.discardGlobal(name));
  });

  const api = new Hono<Env>().basePath(API_BASE);
  // Every error body has `message`, like better-auth's. Only expected errors send their own; others MAY hold internals.
  api.onError((err, c) => {
    if (err instanceof ValidationError)
      return c.json({ message: err.message, errors: err.errors }, 400);
    if (err instanceof ConflictError)
      return c.json({ message: err.message, references: err.references }, 409);
    if (err instanceof HTTPException) return c.json({ message: err.message }, err.status);
    console.error(err);
    return c.json({ message: "Internal Server Error" }, 500);
  });
  api.notFound((c) => c.json({ message: "Not Found" }, 404));
  api.use(withCms(cms), ...pluginMiddleware(plugins, "publicMiddleware"));
  api.on(["GET", "POST"], "/auth/*", async (c) => (await cms.auth()).handler(c.req.raw));
  api.route("/", reads);
  api.use(csrf(), session(cms, asUser), ...pluginMiddleware(plugins, "middleware"));
  api.route("/", writes);
  return api;

  // The read options, or the message of a 400.
  // `doc`: false for globals, which have no `id`, `createdAt` or `updatedAt`.
  function readOptions(
    fields: Fields,
    query: { populate?: string; depth?: string; select?: string },
    doc = true,
  ): ReadOpts | string {
    const spec = parsePopulate(collections, fields, query, cms.populate);
    if (typeof spec === "string") return spec;
    const read: ReadOpts = typeof spec === "number" ? { depth: spec } : { populate: spec };
    if (query.select === undefined) return read;
    const select = parseSelect(query.select);
    const error = badSelectPath(collections, fields, select, spec, "", doc);
    return error ? `Invalid select: ${error}` : { ...read, select };
  }
}

type ReadOpts = {
  populate?: boolean | Record<string, unknown>;
  depth?: number;
  select?: SelectSpec;
};

// A malformed body reads as `undefined`, which fails validation with 400.
const body = (req: { json(): Promise<any> }) => req.json().catch(() => undefined);
