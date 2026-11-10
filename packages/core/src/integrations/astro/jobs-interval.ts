import { consola } from "consola";

const INTERVAL = Symbol.for("tenoncms.jobs-interval");

/**
 * Runs the due jobs now and then every minute, for as long as the process lives. Calling it again replaces the
 * timer, so a reloaded module (HMR) never stacks a second one. The timer does not keep the process alive. A failed
 * tick is logged and the next one tries again.
 * @param cms The server instance, not a request's.
 */
export function startJobsInterval(cms: { jobs: { run(): Promise<unknown> } }) {
  const tick = () => cms.jobs.run().catch((e) => consola.withTag("tenon").error(e));
  const host = globalThis as { [INTERVAL]?: ReturnType<typeof setInterval> };
  clearInterval(host[INTERVAL]);
  host[INTERVAL] = setInterval(tick, 60_000).unref();
  void tick();
}
