import { describe, expect, it, vi } from "vitest";
import { defineCms, definePlugin, defineTask, ValidationError } from "../index.ts";
import type { LifecycleHooks } from "../lifecycle/types.ts";
import { base, origin, setup, testDatabase, testDb } from "./setup.ts";

const cmsWith = (
  hooks: LifecycleHooks & { plugins?: ReturnType<typeof definePlugin>[] },
  database = testDatabase(),
) => defineCms({ ...base, database, ...hooks });

describe("seed", () => {
  it("runs once per database", async () => {
    const { database } = testDb();
    const seed = vi.fn(async ({ cms }) => void (await cms.create("posts", { title: "Seeded" })));

    const a = cmsWith({ seed }, database);
    await a.find("posts");
    await a.find("posts");
    const b = cmsWith({ seed }, database);

    expect(await b.find("posts")).toMatchObject([{ title: "Seeded" }]);
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it("leaves nothing behind when it throws, and runs again on the next start", async () => {
    let fail = true;
    const seed = vi.fn(async ({ cms }) => {
      await cms.create("posts", { title: "Seeded" });
      if (fail) throw new Error("seed failed");
    });
    const cms = cmsWith({ seed });

    await expect(cms.find("posts")).rejects.toThrow("seed failed");
    fail = false;

    expect(await cms.find("posts")).toMatchObject([{ title: "Seeded" }]);
    expect(seed).toHaveBeenCalledTimes(2);
  });

  it("skips the host's seed on a database with content", async () => {
    const { database } = testDb();
    await cmsWith({}, database).create("posts", { title: "Live" });
    const seed = vi.fn();
    const install = vi.fn();
    const plugin = definePlugin({ name: "extra", seed: install });

    await cmsWith({ seed, plugins: [plugin] }, database).find("posts");

    expect(seed).not.toHaveBeenCalled();
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("runs the host's seed after a plugin's on an empty database", async () => {
    const order: string[] = [];
    const plugin = definePlugin({
      name: "extra",
      seed: async ({ cms }) => {
        order.push("plugin");
        await cms.setGlobal("site", { name: "From plugin" });
      },
    });

    await cmsWith({ seed: () => void order.push("host"), plugins: [plugin] }).find("posts");

    expect(order).toEqual(["plugin", "host"]);
  });
});

describe("onInit", () => {
  it("runs before the first query, plugins first, once per instance", async () => {
    const order: string[] = [];
    const plugin = definePlugin({ name: "extra", onInit: () => void order.push("plugin") });
    const cms = cmsWith({
      plugins: [plugin],
      onInit: async ({ cms }) => {
        order.push("host");
        await cms.create("posts", { title: "From init" });
      },
    });

    expect(await cms.find("posts")).toMatchObject([{ title: "From init" }]);
    await cms.find("posts");
    expect(order).toEqual(["plugin", "host"]);
  });

  it("runs after the seed", async () => {
    const order: string[] = [];
    await cmsWith({
      seed: () => void order.push("seed"),
      onInit: () => void order.push("init"),
    }).find("posts");

    expect(order).toEqual(["seed", "init"]);
  });
});

describe("afterImport", () => {
  it("gets the mode and the counts", async () => {
    const afterImport = vi.fn();
    const a = cmsWith({});
    await a.create("posts", { title: "A" });
    const b = cmsWith({ afterImport });

    await b.import(await new Response(await a.export()).blob(), { mode: "replace" });

    expect(afterImport).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "replace",
        counts: expect.objectContaining({ cms_documents: 1 }),
      }),
    );
  });
});

describe("afterError", () => {
  const failing = definePlugin({
    name: "failing",
    publicRoutes: (api) => {
      api.get("/crash", () => {
        throw new Error("crash");
      });
      api.get("/invalid", () => {
        throw new ValidationError({ title: "Required" });
      });
    },
  });

  it("gets unexpected request errors, not 4xx", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const afterError = vi.fn();
    const { fetch } = setup(cmsWith({ afterError, plugins: [failing] }));

    expect((await fetch(`${origin}/_tenon/failing/crash`)).status).toBe(500);
    expect((await fetch(`${origin}/_tenon/failing/invalid`)).status).toBe(400);

    expect(afterError).toHaveBeenCalledTimes(1);
    expect(afterError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "request",
        error: expect.objectContaining({ message: "crash" }),
        request: expect.any(Request),
      }),
    );
  });

  it("gets failed job attempts", async () => {
    const afterError = vi.fn();
    const boom = defineTask({
      run: () => {
        throw new Error("nope");
      },
    });
    const cms = defineCms({
      ...base,
      database: testDatabase(),
      afterError,
      jobs: { tasks: { boom } },
    });
    const { id } = await cms.jobs.queue("boom", {});

    await cms.jobs.run();

    expect(afterError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "job",
        job: expect.objectContaining({ id, task: "boom", attempts: 1 }),
      }),
    );
  });

  it("gets a failed start", async () => {
    const afterError = vi.fn();
    const cms = cmsWith({
      afterError,
      onInit: () => {
        throw new Error("init failed");
      },
    });

    await expect(cms.find("posts")).rejects.toThrow("init failed");
    expect(afterError).toHaveBeenCalledWith(expect.objectContaining({ source: "init" }));
  });

  it("only logs an error it throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetch } = setup(
      cmsWith({
        plugins: [failing],
        afterError: () => {
          throw new Error("reporter down");
        },
      }),
    );

    expect((await fetch(`${origin}/_tenon/failing/crash`)).status).toBe(500);
  });
});
