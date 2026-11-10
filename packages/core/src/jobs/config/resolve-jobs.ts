import { Cron } from "croner";
import { checkRoles } from "../../access/check-access.ts";
import type { Plugin } from "../../plugins/types.ts";
import type { Role } from "../../users/roles.ts";
import type { JobsOptions, Task } from "./define-task.ts";

/** The tasks and cron entries of an instance, merged from the built-in tasks, the plugins and the host. */
export type ResolvedJobs = {
  tasks: Map<string, Task>;
  /** Every cron entry once, in the order the sources list them. */
  scheduled: Array<{ cron: string; task: string }>;
  secret?: string;
};

const RESERVED = "tenon:";

/**
 * Merges the tasks of the built-in tasks, then the plugins in their order, then the host, and checks them.
 * @param builtIns Tasks core brings itself. Their names start with `tenon:`.
 * @throws If a name is reserved, duplicated or outside a plugin's prefix, a cron entry names an unknown task or a
 * plugin's task of another source, a cron pattern does not have 5 fields or is invalid, or a role is unknown.
 */
export function resolveJobs(
  plugins: readonly Plugin[],
  host: JobsOptions | undefined,
  roles: Role[],
  builtIns: Record<string, Task> = {},
): ResolvedJobs {
  const fail = (message: string): never => {
    throw new Error(`tenoncms: ${message}`);
  };
  const known = new Set(roles.map((r) => r.name));
  const tasks = new Map(Object.entries(builtIns));
  const scheduled: ResolvedJobs["scheduled"] = [];

  // `prefix` is set for a plugin, which owns the names that start with it.
  const add = (owner: string, options: JobsOptions | undefined, prefix?: string) => {
    for (const [name, task] of Object.entries(options?.tasks ?? {})) {
      if (name.startsWith(RESERVED)) fail(`task "${name}" MUST NOT start with "${RESERVED}"`);
      if (prefix && !name.startsWith(prefix))
        fail(`task "${name}" of ${owner} MUST start with "${prefix}"`);
      if (tasks.has(name)) fail(`duplicate task "${name}"`);
      checkRoles(known, `task "${name}"`, { run: task.access });
      tasks.set(name, task);
    }

    for (const [cron, names] of Object.entries(options?.scheduledTasks ?? {})) {
      if (cron.trim().split(/\s+/).length !== 5)
        fail(`${owner} MUST use a 5-field cron pattern (minute precision), not "${cron}"`);
      try {
        new Cron(cron);
      } catch {
        fail(`${owner} has an invalid cron pattern "${cron}"`);
      }
      for (const name of names) {
        if (prefix && !name.startsWith(prefix))
          fail(`${owner} MAY schedule its own tasks only, not "${name}"`);
        if (!tasks.has(name)) fail(`${owner} schedules the unknown task "${name}"`);
        if (!scheduled.some((e) => e.cron === cron && e.task === name))
          scheduled.push({ cron, task: name });
      }
    }
  };

  for (const plugin of plugins) add(`plugin "${plugin.name}"`, plugin.jobs, `${plugin.name}:`);
  add("`jobs`", host);

  return { tasks, scheduled, secret: host?.secret };
}
