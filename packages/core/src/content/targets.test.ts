import { describe, expect, it } from "vitest";
import { collectionTarget, globalTarget, targetKey, targetOfKey } from "./targets.ts";

describe("targetOfKey", () => {
  it("inverts targetKey", () => {
    for (const name of [collectionTarget("posts"), globalTarget("site")])
      expect(targetOfKey(targetKey(name))).toEqual(name);
  });

  it("returns undefined for a key that names no target", () => {
    for (const key of ["", "posts", "other:posts", "collection:"])
      expect(targetOfKey(key)).toBeUndefined();
  });
});
