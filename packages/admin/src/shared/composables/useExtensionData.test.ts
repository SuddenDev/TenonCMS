// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, effectScope, nextTick, ref, type EffectScope } from "vue";
import { client, CmsError } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { sessionKey } from "@/shared/options";
import { useExtensionData } from "./useExtensionData";

type Call = { body: any; resolve: (data: unknown) => void; reject: (error: unknown) => void };
let calls: Call[] = [];
let scope: EffectScope | undefined;

function mockRequest() {
  calls = [];
  return vi.spyOn(client, "request").mockImplementation(
    (_path, options) =>
      new Promise((resolve, reject) => {
        calls.push({ body: options?.body, resolve: (data) => resolve({ data }), reject });
      }) as never,
  );
}

function setup<R extends object>(request: () => R | undefined) {
  const expire = vi.fn();
  const app = createApp({}).provide(sessionKey, { expire } as never);
  scope = effectScope();
  const data = app.runWithContext(() => scope!.run(() => useExtensionData(request as never)))!;
  return { data, expire };
}

afterEach(() => {
  scope?.stop();
  vi.restoreAllMocks();
});

it("posts to the load endpoint and exposes the result with its request", async () => {
  const spy = mockRequest();
  const { data } = setup(() => ({ kind: "page", key: "stats", params: {}, query: {} }));
  expect(spy).toHaveBeenCalledWith("/admin/load", {
    method: "POST",
    body: { kind: "page", key: "stats", params: {}, query: {}, locale: "en" },
  });
  expect(data.loading.value).toBe(true);
  calls[0].resolve({ n: 1 });
  await vi.waitFor(() => expect(data.loading.value).toBe(false));
  expect(data.result.value).toEqual({
    request: { kind: "page", key: "stats", params: {}, query: {} },
    data: { n: 1 },
  });
});

it("reloads in the new admin language after a switch", async () => {
  mockRequest();
  setup(() => ({ kind: "page", key: "stats", params: {}, query: {} }));
  i18n.global.locale.value = "de";
  await nextTick();
  i18n.global.locale.value = "en";
  expect(calls.map((c) => c.body.locale)).toEqual(["en", "de"]);
});

it("sends no request without a request body", () => {
  const spy = mockRequest();
  const { data } = setup(() => undefined);
  expect(spy).not.toHaveBeenCalled();
  expect(data.result.value).toBeUndefined();
  expect(data.loading.value).toBe(false);
});

it("ignores a stale response and keeps the previous result while the new one loads", async () => {
  mockRequest();
  const q = ref("a");
  const { data } = setup(() => ({ q: q.value }));
  calls[0].resolve("first");
  await vi.waitFor(() => expect(data.result.value?.data).toBe("first"));
  q.value = "b";
  await nextTick();
  q.value = "c";
  await nextTick();
  expect(calls).toHaveLength(3);
  expect(data.result.value?.data).toBe("first");
  calls[2].resolve("third");
  await vi.waitFor(() => expect(data.result.value?.data).toBe("third"));
  calls[1].resolve("second");
  await new Promise((r) => setTimeout(r, 5));
  expect(data.result.value).toEqual({ request: { q: "c" }, data: "third" });
  expect(data.loading.value).toBe(false);
});

it("does not request again when the request body is unchanged", async () => {
  mockRequest();
  const value = ref("a");
  const trigger = ref(0);
  setup(() => {
    trigger.value;
    return { path: "color", owner: { collection: "posts", id: "1" } };
  });
  value.value = "b";
  trigger.value++;
  await nextTick();
  expect(calls).toHaveLength(1);
});

it("ignores a response that arrives after cleanup", async () => {
  mockRequest();
  const { data } = setup(() => ({ a: 1 }));
  scope!.stop();
  calls[0].resolve("late");
  await new Promise((r) => setTimeout(r, 5));
  expect(data.result.value).toBeUndefined();
});

it("reports an error, then retries through reload", async () => {
  mockRequest();
  const { data } = setup(() => ({ a: 1 }));
  calls[0].reject(new CmsError(500, { message: "Could not load" }));
  await vi.waitFor(() => expect(data.error.value?.message).toBe("Could not load"));
  const done = data.reload();
  expect(data.error.value).toBeUndefined();
  calls[1].resolve({ ok: true });
  await done;
  expect(data.result.value?.data).toEqual({ ok: true });
});

it("reload resolves once the new data arrived", async () => {
  mockRequest();
  const { data } = setup(() => ({ a: 1 }));
  calls[0].resolve(1);
  await vi.waitFor(() => expect(data.result.value?.data).toBe(1));
  const done = data.reload();
  calls[1].resolve(2);
  await done;
  expect(data.result.value?.data).toBe(2);
});

it("expires the session on a 401 and loads nothing afterwards", async () => {
  const spy = mockRequest();
  const { data, expire } = setup(() => ({ a: 1 }));
  calls[0].reject(new CmsError(401, { message: "Unauthorized" }));
  await vi.waitFor(() => expect(expire).toHaveBeenCalledOnce());
  expect(data.error.value).toBeUndefined();
  await data.reload();
  expect(spy).toHaveBeenCalledOnce();
});
