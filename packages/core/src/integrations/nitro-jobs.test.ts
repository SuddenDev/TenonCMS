import { describe, expect, it } from "vitest";
import { JOBS_TASK, withJobsTask } from "./nitro-jobs.ts";

describe("withJobsTask", () => {
  it("adds the every-minute entry", () => {
    expect(withJobsTask()).toEqual({ "* * * * *": [JOBS_TASK] });
  });

  it("keeps the host's entries and joins the string form", () => {
    expect(withJobsTask({ "0 * * * *": "a", "* * * * *": "b" })).toEqual({
      "0 * * * *": "a",
      "* * * * *": ["b", JOBS_TASK],
    });
  });

  it("adds the task once", () => {
    const once = withJobsTask({ "* * * * *": [JOBS_TASK] });
    expect(withJobsTask(once)).toBe(once);
  });
});
