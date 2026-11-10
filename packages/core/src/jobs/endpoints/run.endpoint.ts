import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import type { Core } from "../../cms/runtime/types.ts";
import { noStore } from "../../http/middleware/no-store.middleware.ts";
import type { Env } from "../../http/middleware/types.ts";
import { runJobs } from "../operations/run-jobs.operation.ts";

/**
 * The open clock route: `GET` and `POST /jobs/run` run the due jobs for a caller with `Authorization: Bearer <secret>`.
 * It looks up no session. Mount it only when `jobs.secret` is set.
 */
export function runEndpoint(core: Core, secret: string) {
  return new Hono<Env>()
    .use("/jobs/run", noStore, bearerAuth({ token: secret }))
    .on(["GET", "POST"], "/jobs/run", async (c) => c.json(await runJobs(core)));
}
