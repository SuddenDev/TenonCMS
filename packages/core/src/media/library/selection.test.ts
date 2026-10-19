import { expect, it } from "vitest";
import { folderContains, moveDestination, selectedMedia } from "./selection";

it("selects folder descendants once without matching sibling prefixes", () => {
  const files = [
    { id: "a", folder: "posts/images" },
    { id: "b", folder: "posts/images/trips" },
    { id: "c", folder: "posts/images-old" },
  ];
  expect(selectedMedia(files, ["a"], ["posts/images", "posts/images/trips"])).toEqual(
    files.slice(0, 2),
  );
  expect(folderContains("posts/images", "posts/images-old")).toBe(false);
});

it("keeps a selected folder's name and nested paths when moving it", () => {
  expect(moveDestination("posts/images/trips", ["posts/images"], "archive")).toBe(
    "archive/images/trips",
  );
  expect(moveDestination("posts/images", ["posts/images"], "")).toBe("images");
  expect(moveDestination("posts", ["posts/images"], "archive")).toBe("archive");
});
