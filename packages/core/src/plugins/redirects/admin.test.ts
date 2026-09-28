import { describe, expect, it } from "vitest";
import { parseRows } from "./admin.ts";

describe("parseRows", () => {
  it("reads one redirect per line, 302 for a temporary one, and skips the rest", () => {
    expect(parseRows("/a /b\n  302 /c /d  \n\n/only-one\n")).toEqual([
      { from: "/a", to: "/b", permanent: true },
      { from: "/c", to: "/d", permanent: false },
    ]);
  });
});
