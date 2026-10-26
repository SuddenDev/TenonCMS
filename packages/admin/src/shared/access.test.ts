import { describe, expect, it } from "vitest";
import { can } from "./access";

describe("can", () => {
  it("allows without a permission and denies `false`", () => {
    expect(can({}, "update")).toBe(true);
    expect(can({ access: { update: false } }, "update")).toBe(false);
  });

  it("matches a document against a `where`, and allows without one", () => {
    const entry = { access: { update: { createdBy: "u", archived: null } } };
    expect(can(entry, "update")).toBe(true);
    expect(can(entry, "update", { createdBy: "u" })).toBe(true);
    expect(can(entry, "update", { createdBy: "v" })).toBe(false);
  });
});
