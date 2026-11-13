import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  credentialsFile,
  readCredential,
  removeCredential,
  saveCredential,
} from "./credentials.ts";

const file = () => join(mkdtempSync(join(tmpdir(), "tenon-cli-")), "tenon", "credentials.json");

describe("credentials", () => {
  it("keeps one token per origin, readable only by the owner", async () => {
    const path = file();
    await saveCredential("https://a.test/admin", { token: "t1", email: "a@b.co" }, path);
    await saveCredential("http://localhost:3200", { token: "t2", email: "c@d.co" }, path);

    expect(await readCredential("https://a.test", path)).toMatchObject({ token: "t1" });
    expect(await readCredential("http://localhost:3200/x", path)).toMatchObject({ token: "t2" });
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("forgets a token, and reads nothing without a file", async () => {
    const path = file();
    expect(await readCredential("https://a.test", path)).toBeUndefined();
    await saveCredential("https://a.test", { token: "t1", email: "a@b.co" }, path);

    expect(await removeCredential("https://a.test", path)).toBe(true);
    expect(await readCredential("https://a.test", path)).toBeUndefined();
    expect(await removeCredential("https://a.test", path)).toBe(false);
  });

  it("follows XDG_CONFIG_HOME", () => {
    expect(credentialsFile({ XDG_CONFIG_HOME: "/x" })).toBe("/x/tenon/credentials.json");
  });
});
