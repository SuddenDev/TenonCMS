import { consola } from "consola";
import { withDatabase } from "../../cms/create-cms.ts";
import type { RunResult } from "../../jobs/types.ts";
import type { DatabaseOptions } from "../../db/create-db.ts";
import {
  durableObjectDialect,
  type DurableObjectStorage,
} from "../../db/adapters/durable-object.ts";
import { armAlarm, type AlarmStorage } from "./arm-alarm.ts";

export { durableObjectDialect, type DurableObjectStorage };
export { createObjectClient, type DurableObjectStub } from "./object-client.ts";

/**
 * The `database` of a CMS that runs inside a Durable Object. Each object made by {@link tenonObject} binds its own
 * storage. The instance of the config itself has no database: its schema and `localization` work, but every read or
 * write throws. Code outside the object reads and writes through `createClient()` over the object's `fetch`.
 * @example
 * export default defineCms({ database: durableObject(), ... })
 */
export function durableObject(): DatabaseOptions {
  const fail = (): never => {
    throw new Error(
      "tenoncms: this CMS runs inside its Durable Object (`database: durableObject()`). Outside the object, " +
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

/** The part of a Durable Object's `ctx` that {@link tenonObject} uses. */
export type DurableObjectState = { storage: DurableObjectStorage & AlarmStorage };

/**
 * A Durable Object class that holds the CMS. Each object binds its storage to its own copy of `cms`, which migrates on
 * the first request. Its `fetch` handles `/_tenon` requests. Export the class from the Worker entry and declare it in
 * `wrangler.jsonc` under `durable_objects` and `migrations[].new_sqlite_classes`.
 *
 * The object is also the job clock. Its alarm runs the due jobs and sets itself again for the next one. Queuing a job
 * moves the alarm forward, and the first request of an instance sets it to now if none is set, which seeds the cron entries.
 * @param cms The instance from `defineCms({ database: durableObject() })`.
 * @example
 * export const CmsObject = tenonObject(cms)
 * export default { fetch: (request, env) => env.CMS.getByName("cms").fetch(request) }
 */
export function tenonObject<
  C extends { fetch(request: Request): Promise<Response>; jobs: { run(): Promise<RunResult> } },
>(cms: C) {
  // Per object, outside the class so its type has no private members.
  const objects = new WeakMap<object, { storage: AlarmStorage; armed: boolean }>();

  // ponytail: a plain class has no RPC. Extend `DurableObject` from `cloudflare:workers` once RPC methods are needed.
  return class TenonObject {
    /** This object's copy of the CMS, for server code that runs inside the object. */
    readonly cms: C;

    constructor(ctx: DurableObjectState) {
      objects.set(this, { storage: ctx.storage, armed: false });
      this.cms = withDatabase(
        cms,
        { dialect: durableObjectDialect(ctx.storage) },
        {
          wake: (at) =>
            void armAlarm(ctx.storage, at).catch((e) => consola.withTag("tenon").error(e)),
        },
      );
    }

    // The alarm MUST be set after the request, because setting it during the first migration races with it. A failed
    // request sets it too, so the clock still starts.
    async fetch(request: Request) {
      try {
        return await this.cms.fetch(request);
      } finally {
        const object = objects.get(this)!;
        if (!object.armed) {
          object.armed = true;
          if ((await object.storage.getAlarm()) === null) await object.storage.setAlarm(Date.now());
        }
      }
    }

    /** Runs the due jobs. A throw makes Cloudflare call it again after a backoff. */
    async alarm() {
      const { next } = await this.cms.jobs.run();
      if (next !== null) await armAlarm(objects.get(this)!.storage, Math.max(next, Date.now()));
    }
  };
}
