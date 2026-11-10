import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineCms, verifyWebhook, type WebhooksOptions } from "../index.ts";
import { fastAuth, testDatabase, testDb } from "./setup.ts";

const url = "https://hooks.test/deploy?token=s3cret";
const KEY = "k".repeat(32);
const SECRET = `whsec_${btoa(KEY)}`;
const OLD = "o".repeat(32);

type Sent = { url: string; headers: Headers; raw: string; body: any };
let sent: Sent[];
let reply: () => Response;

beforeEach(() => {
  sent = [];
  reply = () => new Response("ok");
  vi.stubGlobal("fetch", async (to: string, init: RequestInit) => {
    const raw = init.body as string;
    sent.push({ url: String(to), headers: new Headers(init.headers), raw, body: JSON.parse(raw) });
    return reply();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const make = (webhooks: WebhooksOptions, database = testDatabase()) =>
  defineCms({
    collections: {
      posts: {
        permalink: "/posts/{slug}",
        fields: { title: { type: "text", required: true }, slug: { type: "text" } },
      },
      notes: { drafts: false, fields: { body: { type: "text" } } },
      failing: {
        drafts: false,
        fields: { body: { type: "text" } },
        hooks: {
          afterOperation: [
            () => {
              throw new Error("rolled back");
            },
          ],
        },
      },
    },
    globals: { site: { fields: { name: { type: "text" } } } },
    webhooks,
    media: false,
    settings: false,
    database,
    secret: "x".repeat(32),
    auth: fastAuth,
  });

/** Runs the due deliveries and returns the changes of every request sent. */
async function deliver(cms: { jobs: { run(): Promise<unknown> } }) {
  await cms.jobs.run();
  return sent.flatMap((s) => s.body.changes);
}

describe("events", () => {
  it("sends create, update and delete with the permalink before and after", async () => {
    const cms = make({ site: { url } });
    const post = await cms.create("posts", { title: "A", slug: "a" });
    await cms.update("posts", post.id, { slug: "b" });
    await cms.delete("posts", post.id);

    expect(await deliver(cms)).toMatchObject([
      {
        event: "create",
        collection: "posts",
        id: post.id,
        locale: null,
        published: true,
        permalink: "/posts/a",
        previousPermalink: null,
        at: expect.any(String),
      },
      { event: "update", published: true, permalink: "/posts/b", previousPermalink: "/posts/a" },
      { event: "delete", published: false, permalink: null, previousPermalink: "/posts/b" },
    ]);
    expect(sent[0].url).toBe(url);
  });

  it("skips draft saves and sends an update on publish and unpublish", async () => {
    const cms = make({ site: { url } });
    const post = await cms.create("posts", { title: "A", slug: "a" }, { draft: true });
    await cms.update("posts", post.id, { title: "B" }, { draft: true });
    expect(await deliver(cms)).toEqual([]);

    await cms.publish("posts", post.id);
    await cms.unpublish("posts", post.id);
    expect(await deliver(cms)).toMatchObject([
      { event: "update", published: true },
      { event: "update", published: false },
    ]);
  });

  it("sends nothing for a write that rolls back", async () => {
    const cms = make({ site: { url } });
    await expect(cms.create("failing", { body: "x" })).rejects.toThrow("rolled back");
    expect(await deliver(cms)).toEqual([]);
  });

  it("names the global and has no id", async () => {
    const cms = make({ site: { url } });
    await cms.setGlobal("site", { name: "Tenon" });

    const [body] = await deliver(cms);
    expect(body).toMatchObject({ event: "update", global: "site", published: true });
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("collection");
  });

  it("filters by collection and event, and leaves out globals once collections are set", async () => {
    const cms = make({ notes: { url, collections: ["notes"], events: ["delete"] } });
    await cms.create("posts", { title: "A" });
    await cms.setGlobal("site", { name: "Tenon" });
    const note = await cms.create("notes", { body: "x" });
    await cms.delete("notes", note.id);

    expect(await deliver(cms)).toMatchObject([{ event: "delete", collection: "notes" }]);
  });
});

describe("payload", () => {
  it("sends one change per request without debounce", async () => {
    const cms = make({ site: { url } });
    await cms.create("notes", { body: "x" });
    await cms.jobs.run();

    expect(sent.map((s) => s.body)).toMatchObject([
      { changes: [{ event: "create" }], truncated: false },
    ]);
    expect(sent[0].body.changes[0]).not.toHaveProperty("doc");
  });

  it("adds the stored documents with full, and sends the body a function returns", async () => {
    const cms = make({
      full: { url, payload: "full" },
      custom: {
        url,
        payload: ({ changes }) => ({
          text: changes.map((c) => `${c.event} ${c.doc?.body}`).join(),
        }),
      },
    });
    await cms.create("notes", { body: "x" });
    await cms.jobs.run();

    const bodies = sent.map((s) => s.body);
    expect(bodies).toContainEqual(
      expect.objectContaining({
        changes: [
          expect.objectContaining({
            event: "create",
            doc: expect.objectContaining({ body: "x" }),
            previousDoc: null,
          }),
        ],
      }),
    );
    expect(bodies).toContainEqual({ text: "create x" });
  });

  it("collects the changes of a debounce window into one request", async () => {
    const cms = make({ site: { url, debounce: 30 } });
    await cms.create("notes", { body: "a" });
    await cms.create("notes", { body: "b" });
    await cms.jobs.run();
    expect(sent).toEqual([]);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 31_000);
    await cms.create("notes", { body: "c" });
    await cms.jobs.run();

    expect(sent).toHaveLength(1);
    expect(sent[0].body.changes).toHaveLength(3);
  });

  it("keeps the url, secret and headers out of the job", async () => {
    const { database, exec } = testDb();
    const cms = make(
      { site: { url, secret: SECRET, headers: { authorization: "Bearer t0ken" } } },
      database,
    );
    await cms.create("notes", { body: "x" });

    const [{ payload }] = (await exec(`SELECT payload FROM cms_jobs`)) as { payload: string }[];
    expect(payload).not.toMatch(/s3cret|whsec_|t0ken/);
  });
});

describe("signature", () => {
  it("follows Standard Webhooks and signs with every secret", async () => {
    const cms = make({
      site: { url, secret: [SECRET, OLD], headers: { authorization: "Bearer t" } },
    });
    await cms.create("notes", { body: "x" });
    await cms.jobs.run();

    const [{ headers, raw }] = sent;
    const id = headers.get("webhook-id")!;
    const timestamp = headers.get("webhook-timestamp")!;
    const expected = createHmac("sha256", KEY).update(`${id}.${timestamp}.${raw}`).digest("base64");
    expect(headers.get("webhook-signature")!.split(" ")).toEqual([
      `v1,${expected}`,
      expect.stringMatching(/^v1,/),
    ]);
    expect(headers.get("authorization")).toBe("Bearer t");
    expect(headers.get("content-type")).toBe("application/json");

    const request = (body = raw) => new Request("http://x", { method: "POST", headers, body });
    expect(await verifyWebhook(request(), SECRET)).toBe(true);
    expect(await verifyWebhook(request(), OLD)).toBe(true);
    expect(await verifyWebhook(request(), "y".repeat(32))).toBe(false);
    expect(await verifyWebhook(request(`${raw} `), SECRET)).toBe(false);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10 * 60_000);
    expect(await verifyWebhook(request(), SECRET)).toBe(false);
  });

  it("keeps the id across retries and sends no signature without a secret", async () => {
    const cms = make({ site: { url } });
    await cms.create("notes", { body: "x" });
    reply = () => new Response("down", { status: 503 });
    await cms.jobs.run();
    reply = () => new Response("ok");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    await cms.jobs.run();

    const [first, retry] = sent.map((s) => s.headers);
    expect(retry.get("webhook-id")).toBe(first.get("webhook-id"));
    expect(first.has("webhook-signature")).toBe(false);
  });
});

describe("delivery", () => {
  it("retries a failed delivery and stores an error without the url", async () => {
    const { database, exec } = testDb();
    const cms = make({ site: { url } }, database);
    await cms.create("notes", { body: "x" });
    await cms.create("notes", { body: "y" });
    let calls = 0;
    reply = () => {
      calls++;
      if (calls === 1) return new Response("down", { status: 503 });
      throw new TypeError(`fetch failed: ${url}`);
    };
    await cms.jobs.run();

    const rows = (await exec(
      `SELECT status, attempts, max_attempts, error FROM cms_jobs ORDER BY created_at`,
    )) as { status: string; attempts: number; max_attempts: number; error: string }[];
    expect(rows).toMatchObject([
      { status: "queued", attempts: 1, max_attempts: 5, error: "HTTP 503: down" },
      { status: "queued", attempts: 1 },
    ]);
    expect(rows[1].error).not.toContain("s3cret");
  });

  it("finishes a job whose webhook is gone from the config", async () => {
    const { database } = testDb();
    await make({ old: { url } }, database).create("notes", { body: "x" });

    const cms = make({ other: { url } }, database);
    expect(await cms.jobs.run()).toMatchObject({ ran: 1 });
    expect(sent).toEqual([]);
  });
});

describe("config", () => {
  it("throws at startup for a bad url, unknown names or a short secret", () => {
    expect(() => make({ a: { url: undefined as unknown as string } })).toThrow(/"a".*url/);
    expect(() => make({ a: { url: "ftp://x" } })).toThrow(/url/);
    expect(() => make({ a: { url, collections: ["nope"] } })).toThrow(/nope/);
    expect(() => make({ a: { url, globals: ["nope"] } })).toThrow(/nope/);
    expect(() => make({ a: { url, events: ["publish" as "update"] } })).toThrow(/publish/);
    expect(() => make({ a: { url, secret: "short" } })).toThrow(/secret/);
    expect(() => make({ a: { url, secret: "whsec_!!" } })).toThrow(/secret/);
    expect(() => make({ a: { url, debounce: 0 } })).toThrow(/debounce/);
  });
});
