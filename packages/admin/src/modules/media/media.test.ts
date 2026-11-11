import { describe, expect, it } from "vitest";
import { childFolders, fileType, formatSize, selectRange } from "./media";

it.each([
  ["image/jpeg", "image"],
  ["video/mp4", "video"],
  ["audio/mpeg", "audio"],
  ["text/plain", "text"],
  ["application/pdf", "pdf"],
  ["application/zip", "file"],
])("labels %s as %s", (mimeType, type) => {
  expect(fileType(mimeType)).toBe(type);
});

describe("childFolders", () => {
  it("shows immediate children, including parents inferred from nested paths", () => {
    const paths = ["photos/trips/summer", "documents", "photos/events", "photos/trips"];
    expect(childFolders(paths, "")).toEqual([
      { name: "documents", path: "documents" },
      { name: "photos", path: "photos" },
    ]);
    expect(childFolders(paths, "photos")).toEqual([
      { name: "events", path: "photos/events" },
      { name: "trips", path: "photos/trips" },
    ]);
  });

  it("excludes the current folder, siblings with the same prefix, and empty paths", () => {
    expect(childFolders(["", "photos", "photos-old/archive"], "photos")).toEqual([]);
    expect(childFolders(["photos/trips/summer"], "photos/trips")).toEqual([
      { name: "summer", path: "photos/trips/summer" },
    ]);
  });
});

describe("formatSize", () => {
  it("formats the number in the given language", () => {
    expect(formatSize(500, "en")).toBe("500 B");
    expect(formatSize(1536, "en")).toBe("1.5 KB");
    expect(formatSize(1536, "de")).toBe("1,5 KB");
    expect(formatSize(12 * 1024 ** 2, "de")).toBe("12 MB");
  });
});

describe("selectRange", () => {
  const order = ["a", "b", "c", "d"];

  it("adds the range in either direction to the selection", () => {
    expect(selectRange(order, ["a"], "d", "b")).toEqual(["a", "b", "c", "d"]);
    expect(selectRange(order, [], "b", "c")).toEqual(["b", "c"]);
  });

  it("adds only the target without an anchor in the list", () => {
    expect(selectRange(order, ["a"], "elsewhere", "c")).toEqual(["a", "c"]);
  });
});
