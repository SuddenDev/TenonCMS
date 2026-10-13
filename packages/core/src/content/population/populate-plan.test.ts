import { describe, expect, it } from "vitest";
import { step } from "./populate-plan.ts";
describe("step", () => {
  it("treats image and file like a relation", () => {
    const image = { type: "image" } as const;
    const file = { type: "file", many: true } as const;
    expect(step(2, "hero", image)).toEqual({ on: true, child: 1 });
    expect(step(0, "hero", image)).toEqual({ on: false, child: -1 });
    expect(step({ hero: true }, "hero", image)).toEqual({ on: true, child: false });
    expect(step({ other: true }, "docs", file)).toEqual({ on: false, child: false });
    expect(step(false, "docs", file)).toEqual({ on: false, child: false });
  });

  it("passes the plan through groups, arrays and blocks without a hop", () => {
    for (const field of [
      { type: "group", fields: {} },
      { type: "array", fields: {} },
      { type: "blocks", blocks: {} },
    ] as const) {
      expect(step(2, "links", field)).toEqual({ on: true, child: 2 });
      expect(step({ links: true }, "links", field)).toEqual({ on: true, child: 1 });
      expect(step({ links: { page: true } }, "links", field)).toEqual({
        on: true,
        child: { page: true },
      });
      expect(step({ other: true }, "links", field)).toEqual({ on: true, child: false });
      expect(step(false, "links", field)).toEqual({ on: true, child: false });
    }
  });
});
