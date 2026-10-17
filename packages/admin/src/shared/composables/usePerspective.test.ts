// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { client } from "@/shared/api";
import { usePerspective } from "./usePerspective";

const { flush } = vi.hoisted(() => ({ flush: vi.fn() }));
vi.mock("./useLocale", () => ({ useLocale: () => ({ flush }) }));

afterEach(() => {
  document.cookie = "integral-preview=; max-age=0";
  vi.restoreAllMocks();
});

it("saves every open form before changing the page perspective and reloading", async () => {
  let finish!: (saved: boolean) => void;
  flush.mockReturnValue(new Promise<boolean>((resolve) => (finish = resolve)));
  const enter = vi.spyOn(client.preview, "enter").mockResolvedValue(undefined as never);
  const reload = vi.spyOn(location, "reload").mockImplementation(() => {});
  const switching = usePerspective().set("published");
  expect(enter).not.toHaveBeenCalled();
  finish(true);
  await switching;
  expect(enter).toHaveBeenCalledWith("published");
  expect(reload).toHaveBeenCalledOnce();
});

it("keeps the current perspective if a pending edit cannot be saved", async () => {
  flush.mockResolvedValue(false);
  const enter = vi.spyOn(client.preview, "enter").mockResolvedValue(undefined as never);
  const reload = vi.spyOn(location, "reload").mockImplementation(() => {});
  const perspective = usePerspective();
  await perspective.set("published");
  expect(enter).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  expect(perspective.error.value).toBeTruthy();
});

it("keeps the page open and exposes a failed perspective request", async () => {
  flush.mockResolvedValue(true);
  vi.spyOn(client.preview, "enter").mockRejectedValue(new Error("Offline"));
  const reload = vi.spyOn(location, "reload").mockImplementation(() => {});
  const perspective = usePerspective();
  await perspective.set("published");
  expect(reload).not.toHaveBeenCalled();
  expect(perspective.error.value).toBe("Offline");
});

it("does not reload the active perspective", async () => {
  document.cookie = "integral-preview=published";
  const enter = vi.spyOn(client.preview, "enter").mockResolvedValue(undefined as never);
  const reload = vi.spyOn(location, "reload").mockImplementation(() => {});
  await usePerspective().set("published");
  expect(enter).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});

it("ignores a second switch while open forms are saving", async () => {
  let finish!: (saved: boolean) => void;
  flush.mockReturnValue(new Promise<boolean>((resolve) => (finish = resolve)));
  const enter = vi.spyOn(client.preview, "enter").mockResolvedValue(undefined as never);
  vi.spyOn(location, "reload").mockImplementation(() => {});
  const perspective = usePerspective();
  const first = perspective.set("published");
  await perspective.set("published");
  expect(perspective.switching.value).toBe(true);
  finish(true);
  await first;
  expect(enter).toHaveBeenCalledOnce();
  expect(perspective.switching.value).toBe(false);
});
