import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addCommand, compareVersions, detectPackageManager, mayBreak } from "./upgrade.command.ts";

describe("upgrade", () => {
  it("compares versions by number, a release after its prereleases", () => {
    expect(compareVersions("0.24.0", "0.24.1")).toBeLessThan(0);
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0);
  });

  it("treats a new minor below 1.0 and a new major as possibly breaking", () => {
    expect(mayBreak("0.24.0", "0.24.3")).toBe(false);
    expect(mayBreak("0.24.0", "0.25.0")).toBe(true);
    expect(mayBreak("1.2.0", "1.9.0")).toBe(false);
    expect(mayBreak("1.2.0", "2.0.0")).toBe(true);
  });

  it("detects the package manager from the lockfile", () => {
    const dir = mkdtempSync(join(tmpdir(), "tenon-pm-"));
    expect(detectPackageManager(dir, "")).toBe("npm");
    expect(detectPackageManager(dir, "pnpm/10.0.0 npm/? node/v24")).toBe("pnpm");
    writeFileSync(join(dir, "bun.lock"), "");
    expect(detectPackageManager(dir, "pnpm/10.0.0")).toBe("bun");
  });

  it("builds the add command of each package manager", () => {
    expect(addCommand("npm", ["tenoncms@1.0.0"])).toEqual(["npm", ["install", "tenoncms@1.0.0"]]);
    expect(addCommand("pnpm", ["a@1", "b@2"])).toEqual(["pnpm", ["add", "a@1", "b@2"]]);
    expect(addCommand("bun", ["@tenoncms/cli@1.0.0"], true)).toEqual([
      "bun",
      ["add", "--dev", "@tenoncms/cli@1.0.0"],
    ]);
  });
});
