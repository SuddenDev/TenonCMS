import { expect, it } from "vitest";
import { timeZoneGroups, timeZoneLabel, validTimeZone } from "./timezones";

const winter = new Date("2026-01-15T12:00:00Z");

it("labels a zone with its offset and city", () => {
  expect(timeZoneLabel("Europe/Berlin", winter)).toBe("(GMT+1) Berlin");
  expect(timeZoneLabel("America/Argentina/Buenos_Aires", winter)).toBe("(GMT-3) Buenos Aires");
  expect(timeZoneLabel("UTC", winter)).toBe("(GMT+0) UTC");
});

it("groups the zones by region", () => {
  const groups = timeZoneGroups(winter);
  const europe = groups.find((g) => g.region === "Europe")!;
  expect(europe.zones).toContainEqual({ value: "Europe/Berlin", label: "(GMT+1) Berlin" });
  expect(groups.every((g) => g.zones.length)).toBe(true);
});

it("accepts only known zones", () => {
  expect(validTimeZone("Europe/Berlin")).toBe(true);
  expect(validTimeZone("Mars/Base")).toBe(false);
  expect(validTimeZone(null)).toBe(false);
});
