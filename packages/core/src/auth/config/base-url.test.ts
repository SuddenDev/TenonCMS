import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authBaseURL, developmentRequestOrigin } from "./base-url.ts";

beforeEach(() => {
  for (const name of [
    "TENON_BASE_URL",
    "BETTER_AUTH_URL",
    "NEXT_PUBLIC_BETTER_AUTH_URL",
    "PUBLIC_BETTER_AUTH_URL",
    "NUXT_PUBLIC_BETTER_AUTH_URL",
    "NUXT_PUBLIC_AUTH_URL",
    "BASE_URL",
    "__TENON_DEV_ORIGIN",
  ])
    vi.stubEnv(name, undefined);
  vi.stubEnv("NODE_ENV", "development");
});
afterEach(() => vi.unstubAllEnvs());

describe("authBaseURL", () => {
  it("accepts only local or configured request origins in development", () => {
    expect(developmentRequestOrigin(new Request("http://127.0.0.1:4330/path"))).toBe(
      "http://127.0.0.1:4330",
    );
    expect(developmentRequestOrigin(new Request("https://evil.example"))).toBeUndefined();
    vi.stubEnv("__TENON_DEV_ORIGIN", "https://cms.local:4443");
    expect(developmentRequestOrigin(new Request("https://cms.local:4443/path"))).toBe(
      "https://cms.local:4443",
    );
    vi.stubEnv("NODE_ENV", "production");
    expect(developmentRequestOrigin(new Request("http://localhost:4330"))).toBeUndefined();
  });
  it("keeps explicit auth options ahead of environment defaults", () => {
    vi.stubEnv("TENON_BASE_URL", "https://cms.example.com");
    expect(authBaseURL("https://auth.example.com")).toBe("https://auth.example.com");
    const dynamic = { allowedHosts: ["cms.example.com", "preview.example.com"] };
    expect(authBaseURL(dynamic)).toBe(dynamic);
  });

  it("uses the Tenon origin before Better Auth's environment variables", () => {
    vi.stubEnv("TENON_BASE_URL", "https://cms.example.com/");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.com");
    expect(authBaseURL()).toBe("https://cms.example.com");
  });

  it("preserves Better Auth's environment defaults and auth paths", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.com/custom/auth");
    vi.stubEnv("__TENON_DEV_ORIGIN", "http://localhost:4329");
    expect(authBaseURL()).toBe("https://auth.example.com/custom/auth");
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    vi.stubEnv("NUXT_PUBLIC_AUTH_URL", "https://legacy.example.com");
    expect(authBaseURL()).toBe("https://legacy.example.com");
  });

  it("uses a dynamic development origin with a fallback for server calls", () => {
    vi.stubEnv("__TENON_DEV_ORIGIN", "http://localhost:4329");
    expect(authBaseURL()).toEqual({
      allowedHosts: ["localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*", "[::1]", "[::1]:*"],
      fallback: "http://localhost:4329",
    });
  });

  it("allows the configured development hostname", () => {
    vi.stubEnv("__TENON_DEV_ORIGIN", "https://cms.local:4443");
    expect(authBaseURL()).toMatchObject({
      allowedHosts: expect.arrayContaining(["cms.local:4443"]),
      fallback: "https://cms.local:4443",
    });
  });

  it("does not trust development hosts in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("__TENON_DEV_ORIGIN", "http://localhost:4329");
    expect(authBaseURL()).toBeUndefined();
  });

  it.each([
    "not a URL",
    "ftp://cms.example.com",
    "https://cms.example.com/admin",
    "https://cms.example.com?token=secret",
    "https://cms.example.com#fragment",
    "https://user:secret@cms.example.com",
  ])("rejects a TENON_BASE_URL that is not an HTTP origin: %s", (url) => {
    vi.stubEnv("TENON_BASE_URL", url);
    expect(() => authBaseURL()).toThrow("TENON_BASE_URL MUST be an HTTP(S) origin");
  });
});
