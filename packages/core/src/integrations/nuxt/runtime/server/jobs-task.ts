import cms from "#tenon/config";

/** The Nitro task that ticks the job queue. Nitro runs it every minute. */
export default {
  meta: { description: "Runs the due tenoncms jobs" },
  run: async () => ({ result: await cms.jobs.run() }),
};
