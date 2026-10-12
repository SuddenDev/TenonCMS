// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => vi.fn());
vi.mock("idiomorph", () => {
  loaded();
  return { Idiomorph: { morph: vi.fn() } };
});

// Live preview behavior is covered in preview.test.ts. This file stays separate for the module mock.
it("loads no live preview code for a visitor without a session", async () => {
  const { preview } = await import("../index.ts");
  window.name = "";
  const stop = preview({ admin: "/admin" });
  await vi.dynamicImportSettled();
  expect(loaded).not.toHaveBeenCalled();
  stop();
});
