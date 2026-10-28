import { withDatabase } from "../../cms/create-cms.ts";
import type { DatabaseOptions } from "../../db/create-db.ts";
import {
  durableObjectDialect,
  type DurableObjectStorage,
} from "../../db/adapters/durable-object.ts";

export { durableObjectDialect, type DurableObjectStorage };
export { createObjectClient, type DurableObjectStub } from "./object-client.ts";

/**
 * The `database` of a CMS that runs inside a Durable Object. Each object made by {@link integralObject} binds its own
 * storage. The instance of the config itself has no database: its schema and `localization` work, but every read or
 * write throws. Code outside the object reads and writes through `createClient()` over the object's `fetch`.
 * @example
 * export default defineCms({ database: durableObject(), ... })
 */
export function durableObject(): DatabaseOptions {
  const fail = (): never => {
    throw new Error(
      "integral-cms: this CMS runs inside its Durable Object (`database: durableObject()`). Outside the object, " +
        "read and write through `createClient()` over the object's `fetch`.",
    );
  };
  return {
    dialect: {
      createDriver: fail,
      createAdapter: fail,
      createIntrospector: fail,
      createQueryCompiler: fail,
    },
  };
}

/** The part of a Durable Object's `ctx` that {@link integralObject} uses. */
export type DurableObjectState = { storage: DurableObjectStorage };

/**
 * A Durable Object class that holds the CMS. Each object binds its storage to its own copy of `cms`, which migrates on
 * the first request. Its `fetch` handles `/api/cms` requests. Export the class from the Worker entry and declare it in
 * `wrangler.jsonc` under `durable_objects` and `migrations[].new_sqlite_classes`.
 * @param cms The instance from `defineCms({ database: durableObject() })`.
 * @example
 * export const CmsObject = integralObject(cms)
 * export default { fetch: (request, env) => env.CMS.getByName("cms").fetch(request) }
 */
export function integralObject<C extends { fetch(request: Request): Promise<Response> }>(cms: C) {
  // ponytail: a plain class has no RPC. Extend `DurableObject` from `cloudflare:workers` once RPC methods are needed.
  return class IntegralObject {
    /** This object's copy of the CMS, for server code that runs inside the object. */
    readonly cms: C;

    constructor(ctx: DurableObjectState) {
      this.cms = withDatabase(cms, { dialect: durableObjectDialect(ctx.storage) });
    }

    fetch(request: Request) {
      return this.cms.fetch(request);
    }
  };
}
