import { expect, it } from "vitest";
import { src } from "./hosted.fixture.ts";
import { imagekit } from "./imagekit.ts";

it("builds ImageKit URLs from the key", () => {
  const { getImage } = imagekit({ baseURL: "https://ik.imagekit.io/demo" });
  const modifiers = {
    width: 640,
    height: 320,
    format: "webp",
    quality: 80,
    background: "ffffff",
    blur: 10,
  } as const;
  expect(getImage(src, { ...modifiers, fit: "contain" }).url).toBe(
    "https://ik.imagekit.io/demo/a%20b/x.jpg?tr=w-640,h-320,cm-pad_resize,f-webp,q-80,bg-ffffff,bl-10",
  );
  expect(getImage(src, { width: 640, fit: "cover" }).url).toBe(
    "https://ik.imagekit.io/demo/a%20b/x.jpg?tr=w-640,c-maintain_ratio",
  );
});
