import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { siteRoutes } from "./seo-routes.ts";

const project = () => {
  const root = mkdtempSync(join(tmpdir(), "tenon-routes-"));
  mkdirSync(join(root, "public"));
  mkdirSync(join(root, "pages"));
  return { root, pub: join(root, "public"), pages: join(root, "pages") };
};

it("mounts both routes by default", () => {
  const { pub, pages } = project();
  expect(siteRoutes({}, pub, [pages, "/missing"])).toEqual(["/sitemap.xml", "/robots.txt"]);
});

it("skips a route the host serves or turns off", () => {
  const { pub, pages } = project();
  writeFileSync(join(pub, "robots.txt"), "");
  writeFileSync(join(pages, "sitemap.xml.get.ts"), "");
  expect(siteRoutes({}, pub, [pages])).toEqual([]);

  const other = project();
  mkdirSync(join(other.pages, "sitemap.xml"));
  expect(siteRoutes({ robots: false }, other.pub, [other.pages])).toEqual([]);
});
