import { expect, it } from "vitest";
import { passwordChecks, passwordStrength } from "./password";

it("checks each criterion on its own", () => {
  expect(passwordChecks("")).toEqual({
    length: false,
    lowercase: false,
    uppercase: false,
    number: false,
    special: false,
  });
  expect(passwordChecks("Äbcdefg1!")).toEqual({
    length: true,
    lowercase: true,
    uppercase: true,
    number: true,
    special: true,
  });
  expect(passwordChecks("abc def").special).toBe(false);
});

it("scores one point per met criterion", () => {
  expect(passwordStrength(passwordChecks("abc"))).toBe(1);
  expect(passwordStrength(passwordChecks("abcdefgh"))).toBe(2);
  expect(passwordStrength(passwordChecks("Abcdefg1!"))).toBe(5);
});
