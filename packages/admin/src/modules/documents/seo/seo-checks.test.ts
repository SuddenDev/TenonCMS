import { expect, it } from "vitest";
import { SEO_LENGTHS, lengthHint, passingChecks } from "./seo-checks";

const title = { min: 50, max: 60 };
const text = (n: number) => "x".repeat(n);

it("recommends Google's display lengths", () => {
  expect(SEO_LENGTHS).toEqual({
    title: { min: 30, max: 60 },
    description: { min: 120, max: 160 },
  });
});

it("lengthHint rates a length against its limits", () => {
  expect(lengthHint("", title)).toEqual({ status: "missing", progress: 0, rest: "toGo", n: 50 });
  expect(lengthHint(text(45), title)).toEqual({
    status: "short",
    progress: 0.9,
    rest: "toGo",
    n: 5,
  });
  expect(lengthHint(text(46), title)).toMatchObject({ status: "almost", rest: "toGo", n: 4 });
  expect(lengthHint(text(50), title)).toEqual({
    status: "good",
    progress: 0,
    rest: "leftOver",
    n: 10,
  });
  expect(lengthHint(text(55), title)).toEqual({
    status: "good",
    progress: 0.5,
    rest: "leftOver",
    n: 5,
  });
  expect(lengthHint(text(60), title)).toMatchObject({ status: "good", rest: "leftOver", n: 0 });
  expect(lengthHint(text(62), title)).toEqual({
    status: "long",
    progress: 1,
    rest: "tooMany",
    n: 2,
  });
});

it("passingChecks counts title, description and image", () => {
  const ok = { title: text(55), description: text(120), image: true };
  expect(passingChecks(ok)).toBe(3);
  expect(passingChecks({ ...ok, image: false })).toBe(2);
  expect(passingChecks({ title: text(10), description: undefined, image: false })).toBe(0);
});
