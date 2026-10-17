import { expect, it } from "vitest";
import { filterable } from "./filterable.ts";

it("rejects many selects and relations, accepts single ones", () => {
  const fields = {
    one: { type: "select", options: ["a"] },
    tags: { type: "select", options: ["a"], many: true },
    refs: { type: "relation", collection: "c", many: true },
  } as const;
  expect(["one", "tags", "refs"].map((k) => filterable(fields, k))).toEqual([true, false, false]);
});
