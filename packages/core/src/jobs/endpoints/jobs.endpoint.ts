import { Hono } from "hono";
import { z } from "zod";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { input } from "../../users/endpoints/input.ts";
import { cancelJob } from "../operations/cancel-job.operation.ts";
import { listCron } from "../operations/list-cron.operation.ts";
import { listJobs } from "../operations/list-jobs.operation.ts";
import { retryJob, runJobNow } from "../operations/retry-job.operation.ts";
import { JOB_STATUSES } from "../types.ts";

const filter = z.object({
  id: z.string().optional(),
  status: z.enum(JOB_STATUSES).optional(),
  task: z.string().optional(),
  target: z.string().optional(),
  docId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * Protected job routes. Every one checks the `access` rule of the job's task.
 * - `GET /jobs`: the jobs the user MAY see, filtered by `?status=`, `task`, `target`, `docId`, `id` and `limit`.
 * - `GET /jobs/cron`: the cron entries of the tasks the user MAY see, with the next and the last run.
 * - `POST /jobs/:id/retry`: queues a failed job again.
 * - `POST /jobs/:id/run`: runs a queued job, or a failed one after queuing it again, now.
 * - `DELETE /jobs/:id`: cancels a job. A running job answers 409.
 */
export function jobsEndpoint(core: Core) {
  return new Hono<Env>()
    .get("/jobs", async (c) =>
      c.json(await listJobs(core, c.var.user, input(filter, c.req.query()))),
    )
    .get("/jobs/cron", async (c) => c.json(await listCron(core, c.var.user)))
    .post("/jobs/:id/retry", async (c) =>
      c.json(await retryJob(core, c.var.user, c.req.param("id"))),
    )
    .post("/jobs/:id/run", async (c) =>
      c.json(await runJobNow(core, c.var.user, c.req.param("id"))),
    )
    .delete("/jobs/:id", async (c) => {
      await cancelJob(core, c.var.user, c.req.param("id"));
      return c.body(null, 204);
    });
}
