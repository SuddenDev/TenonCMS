import { expect, it } from "vitest";
import { formatMask } from "./format-mask.ts";

it("formats a raw value like the admin input", () => {
  expect(formatMask("1511234567", "+49 ### #######")).toBe("+49 151 1234567");
  expect(formatMask("151", "+49 ### #######")).toBe("+49 151");
});

it("returns an empty string without a value", () => {
  expect(formatMask(null, "####")).toBe("");
  expect(formatMask(undefined, "####")).toBe("");
});
