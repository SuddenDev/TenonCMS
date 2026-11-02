import { expect, it } from "vitest";
import { safeLinkUrl, withSuffix } from "./url.ts";

it("accepts web, email and telephone URLs, relative paths and fragments", () => {
  for (const url of [
    "https://example.com",
    "http://a.b/c?d",
    "mailto:a@b.co",
    "tel:+491",
    "/about",
    "about",
    "#top",
    "?q=1",
  ])
    expect(safeLinkUrl(url)).toBe(true);
});

it("rejects executable schemes, whitespace, control characters and non-strings", () => {
  for (const url of [
    "javascript:alert(1)",
    "JAVASCRIPT:x",
    "data:text/html,x",
    "vbscript:x",
    "/a b",
    "/a\u0000",
    1,
    null,
  ])
    expect(safeLinkUrl(url)).toBe(false);
});

it("appends a suffix to a URL, replacing the part it covers", () => {
  expect(withSuffix("/about", "#team")).toBe("/about#team");
  expect(withSuffix("/about", "?ref=nav#team")).toBe("/about?ref=nav#team");
  expect(withSuffix("/about?x=1#old", "#team")).toBe("/about?x=1#team");
  expect(withSuffix("/about?x=1#old", "?y=2")).toBe("/about?y=2");
  expect(withSuffix("/about?x=1", undefined)).toBe("/about?x=1");
});
