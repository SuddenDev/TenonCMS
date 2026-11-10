import { describe, expect, it } from "vitest";
import type { Job } from "../../../../core/src/jobs/types";
import {
  groupByDoc,
  groupSchedules,
  jobActions,
  jobAttempts,
  jobTargetLink,
  scheduledAction,
} from "./jobs";

const job = (over: Partial<Job> = {}): Job => ({
  id: "j1",
  task: "tenon:publish",
  payload: null,
  status: "queued",
  runAt: "2027-01-01T00:00:00.000Z",
  attempts: 0,
  maxAttempts: 3,
  result: null,
  error: null,
  cron: null,
  target: "collection:posts",
  docId: "d1",
  locale: null,
  user: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("groupSchedules", () => {
  it("joins the locales of one action at one time, ordered by time", () => {
    const later = "2027-02-01T00:00:00.000Z";
    expect(
      groupSchedules([
        job({ task: "tenon:unpublish", runAt: later, locale: "en" }),
        job({ locale: "en" }),
        job({ locale: "de" }),
        job({ task: "tenon:unpublish", locale: "de" }),
        job({ task: "app:other" }),
      ]),
    ).toEqual([
      { action: "publish", runAt: "2027-01-01T00:00:00.000Z", locales: ["en", "de"] },
      { action: "unpublish", runAt: "2027-01-01T00:00:00.000Z", locales: ["de"] },
      { action: "unpublish", runAt: later, locales: ["en"] },
    ]);
  });

  it("has no locales for an entry without languages", () => {
    expect(groupSchedules([job()])).toEqual([
      { action: "publish", runAt: "2027-01-01T00:00:00.000Z", locales: [] },
    ]);
  });
});

describe("jobAttempts", () => {
  it("shows the limit until a job is done", () => {
    expect(jobAttempts(job({ status: "queued" }))).toBe("0 / 3");
    expect(jobAttempts(job({ status: "failed", attempts: 3 }))).toBe("3 / 3");
    expect(jobAttempts(job({ status: "done", attempts: 2 }))).toBe("2");
  });
});

describe("jobActions", () => {
  it("offers Run now and Cancel for a queued job", () => {
    expect(jobActions(job({ status: "queued" }))).toEqual(["run", "cancel"]);
  });

  it("offers Run now, Retry and Cancel for a failed job", () => {
    expect(jobActions(job({ status: "failed" }))).toEqual(["run", "retry", "cancel"]);
  });

  it("offers nothing for a running or done job", () => {
    expect(jobActions(job({ status: "running" }))).toEqual([]);
    expect(jobActions(job({ status: "done" }))).toEqual([]);
  });

  it("never offers Cancel for a cron row", () => {
    expect(jobActions(job({ status: "queued", cron: "* * * * *" }))).toEqual(["run"]);
    expect(jobActions(job({ status: "failed", cron: "* * * * *" }))).toEqual(["run", "retry"]);
  });
});

describe("jobTargetLink", () => {
  const schema = {
    collections: { posts: {} },
    globals: { general: {}, seo: { nav: { display: "settings" } } },
  };

  it("links a document", () => {
    expect(jobTargetLink(job(), schema)?.to).toBe("/content/collections/posts/d1");
  });

  it("links a global, in Settings when it sits there", () => {
    const global = (name: string) => job({ target: `global:${name}`, docId: "" });
    expect(jobTargetLink(global("general"), schema)?.to).toBe("/content/globals/general");
    expect(jobTargetLink(global("seo"), schema)?.to).toBe("/content/settings/globals/seo");
  });

  it("gives nothing for a job without a target or with a target that left the schema", () => {
    expect(jobTargetLink(job({ target: null, docId: null }), schema)).toBeUndefined();
    expect(jobTargetLink(job({ target: "collection:gone" }), schema)).toBeUndefined();
    expect(jobTargetLink(job({ target: "global:gone", docId: "" }), schema)).toBeUndefined();
  });
});

describe("groupByDoc", () => {
  it("collects the jobs of each document", () => {
    const grouped = groupByDoc([
      job({ id: "a", docId: "d1" }),
      job({ id: "b", docId: "d2" }),
      job({ id: "c", docId: "d1", locale: "de" }),
    ]);
    expect(grouped.get("d1")?.map((j) => j.id)).toEqual(["a", "c"]);
    expect(grouped.get("d2")?.map((j) => j.id)).toEqual(["b"]);
  });
});

describe("scheduledAction", () => {
  it("names the action of a built-in task", () => {
    expect(scheduledAction({ task: "tenon:publish" })).toBe("publish");
    expect(scheduledAction({ task: "tenon:unpublish" })).toBe("unpublish");
    expect(scheduledAction({ task: "send-digest" })).toBeUndefined();
  });
});
