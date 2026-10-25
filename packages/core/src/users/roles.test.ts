import { describe, expect, it } from "vitest";
import { normalizeRoles } from "./roles.ts";

describe("normalizeRoles", () => {
  it("lists the built-in roles first, then the host's", () => {
    const roles = normalizeRoles({ author: { label: { en: "Author", de: "Autor" } } });
    expect(roles.map((r) => r.name)).toEqual(["admin", "editor", "author"]);
    expect(roles[2]).toEqual({ name: "author", label: { en: "Author", de: "Autor" } });
  });

  it("labels a role with its name by default", () => {
    expect(normalizeRoles({ reviewer: {} })[2]).toEqual({ name: "reviewer", label: "reviewer" });
  });

  it("keeps the description", () => {
    expect(normalizeRoles({ author: { description: "Writes posts" } })[2].description).toBe(
      "Writes posts",
    );
  });

  it("has only the built-in roles without host roles", () => {
    expect(normalizeRoles(undefined).map((r) => r.name)).toEqual(["admin", "editor"]);
  });

  it("rejects a host role named like a built-in one", () => {
    expect(() => normalizeRoles({ admin: {} })).toThrow('role "admin" is built in');
    expect(() => normalizeRoles({ editor: {} })).toThrow('role "editor" is built in');
  });

  it("rejects a role name outside [a-z0-9-]", () => {
    expect(() => normalizeRoles({ Author: {} })).toThrow('role "Author"');
    expect(() => normalizeRoles({ "content editor": {} })).toThrow('role "content editor"');
  });
});
