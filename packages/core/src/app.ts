import type { User } from "better-auth";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { API_BASE } from "./client.ts";
import { isObject } from "./condition.ts";
import type { Cms } from "./index.ts";
import { ConflictError, ValidationError } from "./errors.ts";
import type { Plugin, PublicRouteEnv, RouteEnv } from "./plugin.ts";
import { filterable, innerFields, mapValue } from "./walk.ts";
import { badSelectPath, type SelectSpec, type Spec } from "./populate.ts";
import type { Collection, Field, Fields, Schema } from "./schema.ts";

/** `asUser(user)` returns the local API with the session user set for hooks. */
export function createApp(
  cms: Cms<Schema>,
  asUser: (user: User) => Cms<Schema>,
  plugins: readonly Plugin[] = [],
) {
  const { schema } = cms;
  const collections = schema.collections ?? {};
  // Hooks are functions. `JSON.stringify` turns them into `null` inside arrays, so they are dropped here.
  // A field MAY be named `hooks`; it has a `type`. `JSON.stringify` drops other functions, like `validate`, itself.
  const publicSchema = JSON.parse(
    JSON.stringify(schema, (key, value) =>
      key === "hooks" && typeof value?.type !== "string" ? undefined : value,
    ),
  );

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

  // Reads are public. Only a request with a cookie MAY see private fields, so others cost no session lookup.
  // A failed lookup, e.g. with a bad `secret`, counts as no session.
  async function readLevel(request: Request): Promise<Level> {
    if (!request.headers.get("cookie")) return "public";
    const session = await cms
      .auth()
      .then((auth) => auth.api.getSession({ headers: request.headers }))
      .catch(() => null);
    return session ? "admin" : "public";
  }

  type Env = { Variables: { cms: Cms<Schema>; user: User } };
  const notFound = () => new HTTPException(404, { message: "Not Found" });
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
  reads.get("/collections/:name", async (c) => {
    const { name, fields } = collectionOf(c.req.param("name"));
    const { limit, populate, depth, select, ...query } = c.req.query();
    const level = await readLevel(c.req.raw);
    const where = whereFromQuery(fields, query, level);
    if (!where) return c.json({ message: "Invalid filter" }, 400);
    if (limit !== undefined && !/^[1-9]\d*$/.test(limit))
      return c.json({ message: "Invalid limit" }, 400);
    const read = readOptions(fields, { populate, depth, select });
    if (typeof read === "string") return c.json({ message: read }, 400);
    const docs = await cms.find(name, { where, limit: limit ? Number(limit) : undefined, ...read });
    return c.json(strip(fields, docs, level));
  });
  reads.get("/collections/:name/:id", async (c) => {
    const { name, fields } = collectionOf(c.req.param("name"));
    const read = readOptions(fields, c.req.query());
    if (typeof read === "string") return c.json({ message: read }, 400);
    const doc = await cms.findById(name, c.req.param("id"), read);
    if (!doc) throw notFound();
    return c.json(strip(fields, doc, await readLevel(c.req.raw)));
  });
  reads.get("/globals/:name", async (c) => {
    const { name, fields } = globalOf(c.req.param("name"));
    const read = readOptions(fields, c.req.query(), false);
    if (typeof read === "string") return c.json({ message: read }, 400);
    return c.json(strip(fields, await cms.getGlobal(name, read), await readLevel(c.req.raw)));
  });

  // Behind CSRF and a session. Writes use `c.var.cms`, which carries the session user.
  const writes = new Hono<Env>();
  writes.get("/schema", (c) => c.json(publicSchema));
  mount(writes, "routes");
  writes.post("/collections/:name", async (c) => {
    const { name } = collectionOf(c.req.param("name"));
    return c.json(await c.var.cms.create(name, await body(c.req)), 201);
  });
  writes.put("/collections/:name/:id", async (c) => {
    const { name } = collectionOf(c.req.param("name"));
    const doc = await c.var.cms.update(name, c.req.param("id"), await body(c.req));
    if (!doc) throw notFound();
    return c.json(doc);
  });
  writes.delete("/collections/:name/:id", async (c) => {
    const { name } = collectionOf(c.req.param("name"));
    await c.var.cms.delete(name, c.req.param("id"));
    return c.body(null, 204);
  });
  writes.put("/globals/:name", async (c) => {
    const { name } = globalOf(c.req.param("name"));
    return c.json(await c.var.cms.setGlobal(name, await body(c.req)));
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
  api.on(["GET", "POST"], "/auth/*", async (c) => (await cms.auth()).handler(c.req.raw));
  api.use(async (c, next) => {
    c.set("cms", cms);
    await next();
  });
  api.route("/", reads);
  api.use(csrf());
  api.use(async (c, next) => {
    const session = await (await cms.auth()).api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ message: "Unauthorized" }, 401);
    c.set("cms", asUser(session.user));
    c.set("user", session.user);
    await next();
  });
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

/** `public`: a read without a session. `admin`: a request with a session. */
type Level = "public" | "admin";
const visible = (f: Field, level: Level) => level === "admin" || !f.private;

/** A tree from dot paths, with `true` at the leaves. A longer path wins over its prefix. Null-prototype nodes, so `__proto__` cannot reach `Object.prototype`. */
function treeOf(paths: string[]): Record<string, any> {
  const tree = Object.create(null);
  for (const path of paths) {
    const keys = path.split(".");
    const leaf = keys.pop()!;
    let node = tree;
    for (const key of keys)
      node = node[key] = isObject(node[key]) ? node[key] : Object.create(null);
    node[leaf] ??= true;
  }
  return tree;
}

// The prefix of `path` up to the first key that is not a group, relation or join, or the hop above `maxDepth`.
function badPopulatePath(
  collections: Record<string, Collection>,
  fields: Fields,
  path: string,
  maxDepth: number,
): string | undefined {
  const keys = path.split(".");
  let hops = 0;
  for (const [i, key] of keys.entries()) {
    const field = Object.hasOwn(fields, key) ? fields[key] : undefined;
    const inner = field && innerFields(collections, field);
    if (field?.type !== "group") hops++;
    if (!inner || hops > maxDepth) return keys.slice(0, i + 1).join(".");
    fields = inner;
  }
}

/** Parses `?populate=` and `?depth=`. Returns the error message for a bad depth, an unknown path, a field that cannot populate or too many hops. */
export function parsePopulate(
  collections: Record<string, Collection>,
  fields: Fields,
  query: { populate?: string; depth?: string },
  config: { depth: number; maxDepth: number },
): Spec | string {
  const depth = query.depth === undefined ? config.depth : Number(query.depth);
  if (query.depth !== undefined && (!/^\d+$/.test(query.depth) || depth > config.maxDepth))
    return `Invalid depth: ${query.depth}`;
  if (query.populate === undefined) return depth;
  if (query.populate === "false") return false;
  const paths = query.populate.split(",");
  for (const path of paths) {
    const bad = badPopulatePath(collections, fields, path, config.maxDepth);
    if (bad !== undefined) return `Invalid populate: ${bad}`;
  }
  return treeOf(paths);
}

/** Parses `?select=`: dot paths, comma-separated. Keys are checked by `badSelectPath()`. */
export function parseSelect(query: string): SelectSpec {
  return treeOf(query.split(",").filter(Boolean));
}

// A malformed body reads as `undefined`, which fails validation with 400.
const body = (req: { json(): Promise<any> }) => req.json().catch(() => undefined);

// A query string as the field's type, so `?featured=true` matches a boolean. `null` matches an empty or missing
// field, like `null` in the local API. `undefined`: the value does not fit the type.
function coerce(type: Field["type"], value: string) {
  if (value === "null") return null;
  if (type === "number") {
    const n = value.trim() === "" ? NaN : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "boolean") return value === "true" ? true : value === "false" ? false : undefined;
  return value;
}

// The `where` of a query. An empty value adds no filter. `undefined` for an unknown field, a field the caller
// cannot see or a value that does not fit its type.
function whereFromQuery(fields: Fields, query: Record<string, string>, level: Level) {
  const where: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(query)) {
    if (!filterable(fields, key) || !visible(fields[key], level)) return undefined;
    if (value === "") continue;
    const typed = coerce(fields[key].type, value);
    if (typed === undefined) return undefined;
    where[key] = typed;
  }
  return where;
}
