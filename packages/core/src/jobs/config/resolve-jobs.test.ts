import { describe, expect, it } from "vitest";
import { BUILT_IN_ROLES } from "../../users/roles.ts";
import type { Plugin } from "../../plugins/types.ts";
import { defineTask, type JobsOptions } from "./define-task.ts";
import { resolveJobs } from "./resolve-jobs.ts";

const task = defineTask({ run: () => {} });
const plugin = (name: string, jobs: Plugin["jobs"]): Plugin => ({ name, jobs });
const resolve = (host?: JobsOptions, plugins: Plugin[] = [], builtIns = {}) =>
  resolveJobs(plugins, host, BUILT_IN_ROLES, builtIns);

describe("resolveJobs", () => {
  it("merges built-in tasks, plugins in order, then the host", () => {
    const jobs = resolve(
      { tasks: { host: task }, scheduledTasks: { "0 3 * * *": ["host", "a:one"] } },
      [
        plugin("a", { tasks: { "a:one": task }, scheduledTasks: { "0 3 * * *": ["a:one"] } }),
        plugin("b", { tasks: { "b:one": task } }),
      ],
      { "tenon:built-in": task },
    );

    expect([...jobs.tasks.keys()]).toEqual(["tenon:built-in", "a:one", "b:one", "host"]);
    expect(jobs.scheduled).toEqual([
      { cron: "0 3 * * *", task: "a:one" },
      { cron: "0 3 * * *", task: "host" },
    ]);
  });

  it("keeps the secret of the host", () => {
    expect(resolve({ secret: "s" }).secret).toBe("s");
    expect(resolve().secret).toBeUndefined();
  });

  it("rejects bad names, cron patterns and roles", () => {
    expect(() => resolve({ tasks: { "tenon:x": task } })).toThrow('"tenon:"');
    expect(() => resolve({ scheduledTasks: { "0 3 * * *": ["nope"] } })).toThrow('"nope"');
    expect(() => resolve({ tasks: { a: task }, scheduledTasks: { "99 * * * *": ["a"] } })).toThrow(
      '"99 * * * *"',
    );
    expect(() =>
      resolve({ tasks: { a: defineTask({ access: ["ghost"], run: () => {} }) } }),
    ).toThrow('task "a" names unknown role "ghost"');
    expect(() =>
      resolve({ tasks: { a: defineTask({ access: ["editor"], run: () => {} }) } }),
    ).not.toThrow();
  });

  it("accepts 5-field cron patterns only", () => {
    const schedule = (cron: string) => () =>
      resolve({ tasks: { a: task }, scheduledTasks: { [cron]: ["a"] } });
    expect(schedule("*/5 * * * *")).not.toThrow();
    expect(schedule("0 0 3 * * *")).toThrow("5-field");
    expect(schedule("@daily")).toThrow("5-field");
    expect(schedule("0 0 3 * * * 2030")).toThrow("5-field");
  });

  it("holds a plugin to its prefix and to its own tasks", () => {
    expect(() => resolve({}, [plugin("a", { tasks: { one: task } })])).toThrow('"a:"');
    expect(() =>
      resolve({ tasks: { host: task } }, [
        plugin("a", { tasks: { "a:one": task }, scheduledTasks: { "0 3 * * *": ["host"] } }),
      ]),
    ).toThrow("its own tasks");
  });

  it("rejects a name that two sources use", () => {
    expect(() =>
      resolve({ tasks: { "a:one": task } }, [plugin("a", { tasks: { "a:one": task } })]),
    ).toThrow('duplicate task "a:one"');
  });
});
