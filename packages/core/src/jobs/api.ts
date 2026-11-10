import { trackWrite } from "../cms/runtime/transaction.ts";
import type { Core, Scope } from "../cms/runtime/types.ts";
import { queueJob } from "./operations/queue.operation.ts";
import type { JobsApi } from "./types.ts";

/** `cms.jobs` of one scope. `run()` is not part of it: only the instance has it, never a hook's `cms`. */
export const jobsApi = (core: Core, scope: Scope): JobsApi => ({
  queue: trackWrite(scope, (task, payload, { runAt, maxAttempts, key, merge } = {}) =>
    queueJob(core, scope, task, payload, { runAt, maxAttempts, key, merge }),
  ),
});
