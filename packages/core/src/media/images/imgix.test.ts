import { expect, it } from "vitest";
import { src } from "./hosted.fixture.ts";
import { imgix } from "./imgix.ts";

it("builds imgix URLs from the key", () => {
  const modifiers = {
    width: 640,
    fit: "cover",
    format: "webp",
    quality: 80,
    background: "ffffff",
    blur: 10,
  } as const;
  expect(imgix({ baseURL: "https://x.imgix.net/" }).getImage(src, modifiers).url).toBe(
    "https://x.imgix.net/a%20b/x.jpg?w=640&fit=crop&fm=webp&q=80&bg=ffffff&blur=10",
  );
});
