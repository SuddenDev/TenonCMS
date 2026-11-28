// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadAdminBar, loadAdminBarItem, setPerspective } from "./site-api.ts";

const callAll = async (admin: string) => {
  await loadAdminBar("/posts/1", "site", admin);
  await loadAdminBarItem("purge", "/posts/1", admin);
  await setPerspective("drafts", admin);
  return vi.mocked(fetch).mock.calls;
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}")),
  );
  vi.spyOn(location, "reload").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("sends every call to the admin's origin with its cookies when the admin is on another origin", async () => {
  const calls = await callAll("https://cms.example.com/admin");
  expect(calls).toHaveLength(3);
  for (const [url, init] of calls) {
    expect(url).toMatch(/^https:\/\/cms\.example\.com\/_tenon\//);
    expect(init?.credentials).toBe("include");
  }
});

it.each([
  ["a path", "/admin"],
  ["a full URL on the page's origin", `${location.origin}/admin`],
])("keeps every call relative and same-origin when the admin is %s", async (_, admin) => {
  const calls = await callAll(admin);
  expect(calls).toHaveLength(3);
  for (const [url, init] of calls) {
    expect(url).toMatch(/^\/_tenon\//);
    expect(init?.credentials).toBe("same-origin");
  }
});
