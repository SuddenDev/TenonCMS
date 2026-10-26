import { describe, expect, it } from "vitest";
import { normalize } from "./fields";

describe("normalize", () => {
  it("leaves fields the user MAY NOT read out of the payload", () => {
    const fields = {
      title: { type: "text" },
      secret: { type: "text", access: { read: false } },
    } as const;
    expect(normalize(fields as never, { title: "A" }, true)).toEqual({ title: "A" });
  });
});
