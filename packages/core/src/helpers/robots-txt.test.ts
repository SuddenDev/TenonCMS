import { expect, it } from "vitest";
import { robotsTxt } from "./robots-txt.ts";

it("renders groups and sitemaps", () => {
  expect(
    robotsTxt({
      rules: [
        { userAgent: "*", allow: ["/"], disallow: ["/_tenon/"] },
        { userAgent: ["GPTBot", "CCBot"], disallow: ["/"] },
      ],
      sitemaps: ["https://a.co/sitemap.xml"],
    }),
  ).toBe(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /_tenon/",
      "",
      "User-agent: GPTBot",
      "User-agent: CCBot",
      "Disallow: /",
      "",
      "Sitemap: https://a.co/sitemap.xml",
      "",
    ].join("\n"),
  );
});

it("writes an empty Disallow for a group without rules", () => {
  expect(robotsTxt({ rules: [{ userAgent: "*" }] })).toBe("User-agent: *\nDisallow:\n");
});
