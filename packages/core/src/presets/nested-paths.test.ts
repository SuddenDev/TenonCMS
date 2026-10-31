import { expect, it } from "vitest";
import { page } from "./page.ts";

const path = async (slug: string, parentPath?: string) =>
  (
    await page().hooks.beforeChange.buildPath({
      data: { slug, parent: parentPath === undefined ? null : "p" },
      collection: "pages",
      cms: { findById: async () => ({ path: parentPath }) },
    } as any)
  )?.path;

it("buildPath: index at root is /", async () => expect(await path("index")).toBe("/"));
it("buildPath: root page", async () => expect(await path("about")).toBe("/about"));
it("buildPath: child of / has one slash", async () =>
  expect(await path("child", "/")).toBe("/child"));
it("buildPath: nested child", async () =>
  expect(await path("berlin", "/about/team")).toBe("/about/team/berlin"));
