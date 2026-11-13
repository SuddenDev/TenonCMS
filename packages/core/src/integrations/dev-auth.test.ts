import { describe, expect, it } from "vitest";
import { developmentOrigin } from "./dev-auth.ts";

describe("developmentOrigin", () => {
  it.each(["0.0.0.0", "::", "[::]"])("uses localhost for the wildcard listener %s", (address) => {
    expect(developmentOrigin({ address, port: 4329, family: "IPv6" })).toBe(
      "http://localhost:4329",
    );
  });
  it("preserves the configured hostname and HTTPS on the actual port", () => {
    expect(
      developmentOrigin({ address: "127.0.0.1", port: 4443, family: "IPv4" }, true, "cms.local"),
    ).toBe("https://cms.local:4443");
  });
  it("brackets IPv6 hosts", () => {
    expect(developmentOrigin({ address: "::1", port: 4329, family: "IPv6" })).toBe(
      "http://[::1]:4329",
    );
  });
});
