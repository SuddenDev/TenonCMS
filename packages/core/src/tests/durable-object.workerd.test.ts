import { env } from "cloudflare:workers";
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
  SELF,
} from "cloudflare:test";
import { createClient } from "../client/index.ts";
import { describe, expect, it, vi } from "vitest";
import type { CmsObject } from "./workerd/worker.ts";

type Cms = InstanceType<typeof CmsObject>["cms"];

const fresh = () => env.CMS.getByName(crypto.randomUUID());
const inCms = <R>(
  stub: DurableObjectStub,
  fn: (cms: Cms, state: DurableObjectState) => Promise<R>,
) =>
  runInDurableObject(stub, (instance: InstanceType<typeof CmsObject>, state) =>
    fn(instance.cms, state),
  );
const names = (state: DurableObjectState, type: string) =>
  state.storage.sql
    .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = ?", type)
    .toArray()
    .map((r) => r.name);

describe("migrations", () => {
  it("run on the first call, and again as a no-op after eviction", async () => {
    const stub = fresh();
    await inCms(stub, (cms) => cms.create("authors", { name: "Ada" }));
    await inCms(stub, async (_, state) => {
      expect(names(state, "table")).toEqual(
        expect.arrayContaining(["cms_documents", "cms_versions", "user", "session", "apikey"]),
      );
      expect(names(state, "index")).toContain("cms_media_key_idx");
    });
    await evictDurableObject(stub);
    await inCms(stub, async (cms) => {
      expect((await cms.find("authors")).map((a) => a.name)).toEqual(["Ada"]);
    });
  });
});

describe("objects", () => {
  // Objects share the isolate, and with it the module's `cms`. Each MUST still read its own storage.
  it("keep their own data in one isolate", async () => {
    const [a, b] = [fresh(), fresh()];
    await inCms(a, (cms) => cms.create("authors", { name: "Ada" }));
    await inCms(b, async (cms) => expect(await cms.find("authors")).toEqual([]));
  });
});

describe("writes", () => {
  it("commit a nested write from a hook", () =>
    inCms(fresh(), async (cms) => {
      await cms.create("posts", { title: "ok" });
      expect((await cms.find("posts")).map((p) => p.title)).toEqual(["ok"]);
      expect((await cms.find("logs")).map((l) => l.message)).toEqual(["ok"]);
    }));

  it("roll back the write and the nested write when a later hook throws", () =>
    inCms(fresh(), async (cms, state) => {
      await expect(cms.create("posts", { title: "fail" })).rejects.toThrow("forced failure");
      expect(await cms.find("posts")).toEqual([]);
      expect(await cms.find("logs")).toEqual([]);
      const { n } = state.storage.sql
        .exec<{ n: number }>("SELECT count(*) AS n FROM cms_documents")
        .one();
      expect(n).toBe(0);
    }));

  it("run concurrent writes of one request one after another", () =>
    inCms(fresh(), async (cms) => {
      const results = await Promise.allSettled([
        cms.create("posts", { title: "fail" }),
        cms.create("posts", { title: "ok" }),
      ]);
      expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
      expect((await cms.find("posts")).map((p) => p.title)).toEqual(["ok"]);
      expect((await cms.find("logs")).map((l) => l.message)).toEqual(["ok"]);
    }));
});

describe("reads and integrity", () => {
  it("filter, populate, read drafts and restrict deletes", () =>
    inCms(fresh(), async (cms) => {
      const ada = await cms.create("authors", { name: "Ada" });
      const bob = await cms.create("authors", { name: "Bob" });
      await cms.create("posts", { title: "a", featured: true, author: ada.id });
      await cms.create("posts", { title: "b", featured: false });
      await cms.create("pages", { sections: [{ blockType: "quote", text: "q", by: bob.id }] });
      await cms.create("posts", { title: "draft" }, { draft: true });

      expect((await cms.find("posts", { where: { featured: true } })).map((p) => p.title)).toEqual([
        "a",
      ]);
      expect((await cms.findOne("posts", { where: { title: "a" } }))?.author).toMatchObject({
        name: "Ada",
      });
      expect((await cms.find("posts")).map((p) => p.title)).toEqual(["b", "a"]);
      expect((await cms.withDrafts().find("posts")).map((p) => p.title)).toEqual([
        "draft",
        "b",
        "a",
      ]);

      await expect(cms.delete("authors", ada.id)).rejects.toMatchObject({
        references: [expect.any(Object)],
      });
      await expect(cms.delete("authors", bob.id)).rejects.toMatchObject({
        references: [expect.any(Object)],
      });
    }));

  it("populate more relations than the 100 bound parameters of one query", () =>
    inCms(fresh(), async (cms) => {
      const ids: string[] = [];
      for (let i = 0; i < 150; i++) ids.push((await cms.create("authors", { name: `a${i}` })).id);
      const post = await cms.create("posts", { title: "many", contributors: ids });
      const read = await cms.findById("posts", post.id);
      expect(read?.contributors).toHaveLength(150);
      expect(read?.contributors?.[149]).toMatchObject({ name: "a149" });
    }));
});

describe("alarm", () => {
  const later = () => Date.now() + 3_600_000;
  const alarmOf = (stub: DurableObjectStub) =>
    inCms(stub, async (_, state) => state.storage.getAlarm());
  const cronRows = (stub: DurableObjectStub) =>
    inCms(
      stub,
      async (_, state) =>
        state.storage.sql
          .exec<{ n: number }>("SELECT count(*) AS n FROM cms_jobs WHERE cron IS NOT NULL")
          .one().n,
    );

  // The alarm is set after the commit, without the caller waiting for it.
  it("runs a job that is due once the job is queued", () =>
    inCms(fresh(), async (cms) => {
      await cms.jobs.queue("log", "queued");
      await vi.waitFor(async () =>
        expect((await cms.find("logs")).map((l) => l.message)).toEqual(["queued"]),
      );
    }));

  it("moves the alarm forward for a job that is due sooner", async () => {
    const stub = fresh();
    const at = later();
    await inCms(stub, (cms) => cms.jobs.queue("log", "later", { runAt: new Date(at) }));
    await vi.waitFor(async () => expect(await alarmOf(stub)).toBe(at));
    await inCms(stub, (cms) => cms.jobs.queue("log", "sooner", { runAt: new Date(at - 1000) }));
    await vi.waitFor(async () => expect(await alarmOf(stub)).toBe(at - 1000));
  });

  it("sets itself again for a job that is not due yet", async () => {
    const stub = fresh();
    const at = later();
    await inCms(stub, (cms) => cms.jobs.queue("log", "later", { runAt: new Date(at) }));
    await vi.waitFor(async () => expect(await alarmOf(stub)).toBe(at));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await alarmOf(stub)).toBeLessThanOrEqual(at);
    await inCms(stub, async (cms) => expect(await cms.find("logs")).toEqual([]));
  });

  // workerd keeps the alarm in its internal `_cf_KV` table, which Kysely's introspection cannot read.
  it("leaves migrations working after an eviction", async () => {
    const stub = fresh();
    const at = later();
    await inCms(stub, (cms) => cms.jobs.queue("log", "later", { runAt: new Date(at) }));
    await vi.waitFor(async () => expect(await alarmOf(stub)).toBe(at));
    await evictDurableObject(stub);
    await inCms(stub, async (cms) => expect(await cms.find("logs")).toEqual([]));
  });

  it("starts with the first request, which seeds the cron entries", async () => {
    const stub = fresh();
    await stub.fetch("http://localhost/_tenon/posts");
    await vi.waitFor(async () => expect(await cronRows(stub)).toBe(1));
    expect(await alarmOf(stub)).not.toBeNull();
  });
});

describe("over HTTP through the Worker", () => {
  it("signs up, writes with a session, and accepts an invite", async () => {
    const jar = new Map<string, string>();
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("origin", "http://localhost");
      if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
      const res = await SELF.fetch(new Request(input, { ...init, headers }));
      for (const c of res.headers.getSetCookie()) {
        const [name, value] = c.split(";")[0].split(/=(.*)/);
        if (value) jar.set(name, value);
        else jar.delete(name);
      }
      return res;
    };
    const client = createClient({ baseUrl: "http://localhost", fetch });

    await client.signUp({ name: "Admin", email: "a@b.co", password: "password123" });
    await client.create("posts", { title: "over http" });
    expect((await client.find("posts")).map((p: any) => p.title)).toEqual(["over http"]);

    const invite = await client.invites.create({
      email: "e@b.co",
      role: "editor",
      url: "http://localhost/admin/invite",
    });
    const token = new URL((invite as any).link).searchParams.get("token");
    jar.clear();
    const accepted = await fetch("http://localhost/_tenon/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, name: "Ed", password: "password123" }),
    });
    expect(accepted.status).toBe(200);
    expect(await client.getSession()).toMatchObject({ user: { email: "e@b.co", role: "editor" } });
  });
});
