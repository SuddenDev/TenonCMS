import { styleText } from "node:util";
import { describe, expect, it } from "vitest";
import { configuredOrigin, deliveryNote, formatUsers, roleOptions } from "./users.command.ts";

describe("configuredOrigin", () => {
  it("takes the origin of a fixed base URL", () => {
    expect(configuredOrigin("https://example.com/")).toBe("https://example.com");
  });

  it("has none for a dynamic or missing base URL", () => {
    expect(configuredOrigin({ allowedHosts: ["localhost"] })).toBeUndefined();
    expect(configuredOrigin(undefined)).toBeUndefined();
  });
});

describe("deliveryNote", () => {
  it("tells that the email went out", () => {
    expect(deliveryNote({ sent: true }, "a@b.co")).toMatchObject({ warn: false });
  });

  it("warns without email, and when sending failed", () => {
    const missing = deliveryNote({ sent: false }, "a@b.co");
    expect(missing).toMatchObject({ warn: true, text: expect.stringContaining("No email") });
    const failed = deliveryNote({ sent: false, message: "Sending failed" }, "a@b.co");
    expect(failed).toMatchObject({ warn: true, text: expect.stringContaining("Sending failed") });
  });
});

describe("formatUsers", () => {
  const user = { id: "1", createdAt: "2026-01-01T00:00:00.000Z" };

  it("prints one aligned row per user, with a header", () => {
    const table = formatUsers([
      { ...user, name: "Admin", email: "a@b.co", role: "admin", deactivated: false },
      { ...user, id: "u2", name: "Ed", email: "ed@example.com", role: null, deactivated: true },
    ]).split("\n");
    expect(table).toHaveLength(3);
    expect(table[0]).toMatch(/^ID\s+Name\s+Email\s+Role\s+Status$/);
    expect(table[1]).toMatch(/^1\s+Admin\s+a@b\.co\s+admin\s+active$/);
    expect(table[2]).toMatch(/^u2\s+Ed\s+ed@example\.com\s+-\s+deactivated$/);
    expect(table[1].indexOf("a@b.co")).toBe(table[2].indexOf("ed@example.com"));
  });

  it("colors the status green when active and red when deactivated", () => {
    const [, active, deactivated] = formatUsers(
      [
        { ...user, name: "A", email: "a@b.co", role: "admin", deactivated: false },
        { ...user, name: "E", email: "e@b.co", role: "editor", deactivated: true },
      ],
      { color: true },
    ).split("\n");
    expect(active).toContain(styleText("green", "active", { validateStream: false }));
    expect(deactivated).toContain(styleText("red", "deactivated", { validateStream: false }));
  });

  it("says so when there are no users", () => {
    expect(formatUsers([])).toBe("No users yet.");
  });
});

describe("roleOptions", () => {
  it("offers each role with its English label and description", () => {
    expect(
      roleOptions([
        { name: "editor", label: { en: "Editor", de: "Redakteur" }, description: "Edits" },
        { name: "reviewer", label: "reviewer" },
      ]),
    ).toEqual([
      { value: "editor", label: "Editor", hint: "Edits" },
      { value: "reviewer", label: "reviewer", hint: undefined },
    ]);
  });
});
