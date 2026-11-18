import { expect, it } from "vitest";
import { bunny } from "./bunny.ts";
import { src } from "./hosted.fixture.ts";

it("builds Bunny Optimizer URLs from the key, without the modifiers it lacks", () => {
  const modifiers = {
    width: 640,
    height: 320,
    fit: "cover",
    format: "webp",
    quality: 80,
    blur: 10,
  } as const;
  expect(bunny({ baseURL: "https://x.b-cdn.net" }).getImage(src, modifiers).url).toBe(
    "https://x.b-cdn.net/a%20b/x.jpg?width=640&height=320&quality=80&blur=10",
  );
});
