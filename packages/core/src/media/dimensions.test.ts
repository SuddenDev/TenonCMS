import { describe, expect, it } from "vitest";
import { gif, jpeg, png, svg, webp } from "../tests/fixtures.ts";
import { dimensions } from "./dimensions.ts";

describe("dimensions", () => {
  it("reads width and height from the header", () => {
    expect(dimensions(png)).toEqual({ width: 1, height: 1 });
    expect(dimensions(jpeg)).toEqual({ width: 3, height: 2 });
    expect(dimensions(gif)).toEqual({ width: 1, height: 1 });
    expect(dimensions(webp)).toEqual({ width: 1, height: 1 });
    expect(dimensions(svg)).toEqual({ width: 20, height: 10 });
  });

  it("returns undefined for bytes that are not an image", () => {
    expect(dimensions(new TextEncoder().encode("hello world"))).toBeUndefined();
    expect(dimensions(png.slice(0, 10))).toBeUndefined();
  });
});
