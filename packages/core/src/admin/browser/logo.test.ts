import { describe, expect, it } from "vitest";
import { logoAt } from "./logo.ts";

describe("logoAt", () => {
  it("uses one logo everywhere", () => {
    expect(logoAt("/logo.svg", "header")).toBe("/logo.svg");
    const themed = { light: "/l.svg", dark: "/d.svg" };
    expect(logoAt(themed, "login")).toBe(themed);
  });

  it("picks the logo of a place, and none for a place without one", () => {
    const logo = { login: { light: "/l.svg", dark: "/d.svg" } };
    expect(logoAt(logo, "login")).toEqual({ light: "/l.svg", dark: "/d.svg" });
    expect(logoAt(logo, "header")).toBeUndefined();
    expect(logoAt(undefined, "header")).toBeUndefined();
  });
});
