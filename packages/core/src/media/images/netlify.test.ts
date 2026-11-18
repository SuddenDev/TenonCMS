import { expect, it } from "vitest";
import { src } from "./hosted.fixture.ts";
import { netlify } from "./netlify.ts";

it("builds /.netlify/images URLs", () => {
  const modifiers = {
    width: 640,
    height: 320,
    fit: "inside",
    format: "jpeg",
    quality: 80,
  } as const;
  expect(netlify().getImage(src, modifiers).url).toBe(
    "/.netlify/images?url=%2F_tenon%2Fmedia%2Ffiles%2Fa%2520b%2Fx.jpg&w=640&h=320&fit=contain&fm=jpg&q=80",
  );
});
