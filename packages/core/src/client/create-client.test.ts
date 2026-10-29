import { describe, expect, it, vi } from "vitest";
import { createClient } from "./index.ts";

// Records each request and answers with `body`.
function recorder(body: unknown = {}) {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }),
  );
  const calls = () =>
    fetch.mock.calls.map(([url, init]) => [
      init?.method,
      String(url),
      init?.body && JSON.parse(String(init.body)),
    ]);
  return { fetch, calls, client: createClient({ fetch, baseUrl: "http://x" }) };
}

it("requests and completes a password reset through the auth endpoints", async () => {
  const { client, calls } = recorder({ status: true });
  const request = {
    email: "admin@example.com",
    redirectTo: "https://example.com/cms/reset-password",
  };
  const reset = { token: "reset-token", newPassword: "a-new-password" };
  await expect(client.requestPasswordReset(request)).resolves.toBeUndefined();
  await expect(client.resetPassword(reset)).resolves.toBeUndefined();
  expect(calls()).toEqual([
    ["POST", "http://x/_tenon/auth/request-password-reset", request],
    ["POST", "http://x/_tenon/auth/reset-password", reset],
  ]);
});

describe("locale on reads", () => {
  it("sends locale, fallback and alternates as query parameters", async () => {
    const { client, calls } = recorder([]);
    await client.find("posts", { locale: "de", fallback: false, alternates: true, limit: 2 });
    await client.findById("posts", "p 1", { locale: "de" });
    await client.getGlobal("footer", { locale: "de", fallback: true });
    expect(calls().map(([, url]) => url)).toEqual([
      "http://x/_tenon/collections/posts?limit=2&locale=de&fallback=false&alternates=true",
      "http://x/_tenon/collections/posts/p%201?locale=de",
      "http://x/_tenon/globals/footer?locale=de&fallback=true",
    ]);
  });

  it("sends nothing without the options", async () => {
    const { client, calls } = recorder([]);
    await client.find("posts");
    expect(calls()[0][1]).toBe("http://x/_tenon/collections/posts");
  });
});

describe("locale on preview URLs", () => {
  it("sends the locale as a query parameter", async () => {
    const { client, calls } = recorder({ url: "/de/x" });
    await client.previewUrl("posts", { slug: "x" }, { locale: "de" });
    await client.previewGlobalUrl("footer", {}, { locale: "de" });
    await client.previewUrl("posts", {});
    expect(calls().map(([, url]) => url)).toEqual([
      "http://x/_tenon/collections/posts/preview-url?locale=de",
      "http://x/_tenon/globals/footer/preview-url?locale=de",
      "http://x/_tenon/collections/posts/preview-url",
    ]);
  });
});

describe("locale on writes", () => {
  it("sends locale as a query parameter", async () => {
    const { client, calls } = recorder();
    await client.create("posts", { title: "a" }, { locale: "de" });
    await client.update("posts", "1", { title: "a" }, { locale: "de" });
    await client.createDraft("posts", { title: "a" }, { locale: "de" });
    await client.updateDraft("posts", "1", { title: "a" }, { locale: "de" });
    await client.publish("posts", "1", { locale: "de" });
    await client.discard("posts", "1", { locale: "de" });
    await client.setGlobal("footer", { note: "a" }, { locale: "de" });
    await client.setGlobalDraft("footer", { note: "a" }, { locale: "de" });
    await client.publishGlobal("footer", { locale: "de" });
    await client.discardGlobal("footer", { locale: "de" });
    expect(
      calls().map(([method, url]) => `${method} ${url.replace("http://x/_tenon", "")}`),
    ).toEqual([
      "POST /collections/posts?locale=de",
      "PUT /collections/posts/1?locale=de",
      "POST /collections/posts/draft?locale=de",
      "PUT /collections/posts/1/draft?locale=de",
      "POST /collections/posts/1/publish?locale=de",
      "DELETE /collections/posts/1/draft?locale=de",
      "PUT /globals/footer?locale=de",
      "PUT /globals/footer/draft?locale=de",
      "POST /globals/footer/publish?locale=de",
      "DELETE /globals/footer/draft?locale=de",
    ]);
  });

  it("sends no query without a locale", async () => {
    const { client, calls } = recorder();
    await client.publish("posts", "1");
    await client.setGlobal("footer", {});
    expect(calls().map(([, url]) => url)).toEqual([
      "http://x/_tenon/collections/posts/1/publish",
      "http://x/_tenon/globals/footer",
    ]);
  });

  it("discards every draft with `all`", async () => {
    const { client, calls } = recorder();
    await client.discard("posts", "1", { all: true });
    await client.discardGlobal("footer", { all: true });
    expect(calls().map(([, url]) => url)).toEqual([
      "http://x/_tenon/collections/posts/1/draft?all=true",
      "http://x/_tenon/globals/footer/draft?all=true",
    ]);
  });
});

describe("copy and remove a locale", () => {
  it("calls the locale routes of collections", async () => {
    const { client, calls } = recorder();
    await client.copyLocale("posts", "1", { from: "en", to: "de" });
    await client.removeLocale("posts", "1", "de");
    expect(calls()).toEqual([
      ["POST", "http://x/_tenon/collections/posts/1/locales/de/copy", { from: "en" }],
      ["DELETE", "http://x/_tenon/collections/posts/1/locales/de", undefined],
    ]);
  });

  it("calls the locale routes of globals", async () => {
    const { client, calls } = recorder();
    await client.copyGlobalLocale("footer", { from: "en", to: "de" });
    await client.removeGlobalLocale("footer", "de");
    expect(calls()).toEqual([
      ["POST", "http://x/_tenon/globals/footer/locales/de/copy", { from: "en" }],
      ["DELETE", "http://x/_tenon/globals/footer/locales/de", undefined],
    ]);
  });
});

describe("localization()", () => {
  const config = { locales: ["en", "de"], defaultLocale: "en", fallback: true, routing: false };

  it("fetches once per client", async () => {
    const { client, fetch } = recorder(config);
    const [a, b] = await Promise.all([client.localization(), client.localization()]);
    await client.localization();
    expect(a).toEqual(config);
    expect(b).toBe(a);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("http://x/_tenon/localization");
  });

  it("keeps a client's result to itself", async () => {
    const one = recorder(config);
    const two = recorder(config);
    await one.client.localization();
    await two.client.localization();
    expect(two.fetch).toHaveBeenCalledTimes(1);
  });

  it("tries again after a failure", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(config)));
    const client = createClient({ fetch });
    await expect(client.localization()).rejects.toThrow();
    expect(await client.localization()).toEqual(config);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
