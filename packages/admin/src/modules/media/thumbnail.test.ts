import { expect, it } from "vitest";
import { thumbnailSize } from "./thumbnail";

it("scales the short side to 320 px, caps the long side and never upscales", () => {
  expect(thumbnailSize(4000, 3000)).toEqual({ width: 427, height: 320 });
  expect(thumbnailSize(3000, 4000)).toEqual({ width: 320, height: 427 });
  expect(thumbnailSize(10000, 1000)).toEqual({ width: 1024, height: 102 });
  expect(thumbnailSize(200, 100)).toEqual({ width: 200, height: 100 });
});
