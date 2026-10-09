// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { lazyMount, loadClientRef } from "./lazy-mount.ts";

it("mounts with the latest context and does not mount after cleanup", async () => {
  let resolve!: (value: unknown) => void;
  const load = () =>
    new Promise<unknown>((r) => {
      resolve = r;
    });
  const mount = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }));
  const el = document.createElement("div");
  const handle = lazyMount<{ value: number }>(load)(el, { value: 1 });
  if (typeof handle === "function") throw new Error("expected handle");
  handle.update!({ value: 2 });
  resolve(mount);
  await Promise.resolve();
  expect(mount).toHaveBeenCalledWith(el, { value: 2 });
  handle.unmount();
  expect(mount.mock.results[0].value.unmount).toHaveBeenCalledOnce();
  const stopped = lazyMount(load)(el, {});
  if (typeof stopped === "function") throw new Error("expected handle");
  stopped.unmount();
  resolve(mount);
  await Promise.resolve();
  expect(mount).toHaveBeenCalledOnce();
});

it("reports absent references and invalid mount exports", async () => {
  await expect(loadClientRef({ clientRef: "missing" }, {})).rejects.toThrow("not discovered");
  await expect(
    loadClientRef({ clientRef: "module#missing" }, { "module#missing": async () => undefined }),
  ).rejects.toThrow("missing export");
  const el = document.createElement("div");
  lazyMount(async () => ({}))(el, {});
  await vi.waitFor(() => expect(el.textContent).toContain("MUST export a mount function"));
});

it("waits for the gate as well as the code, and mounts with the latest context", async () => {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const mount = vi.fn(() => ({ unmount: vi.fn() }));
  const el = document.createElement("div");
  const handle = lazyMount<{ n: number }>(async () => mount, gate)(el, { n: 1 });
  if (typeof handle === "function") throw new Error("expected handle");
  await new Promise((r) => setTimeout(r, 5));
  expect(mount).not.toHaveBeenCalled();
  handle.update!({ n: 2 });
  open();
  await vi.waitFor(() => expect(mount).toHaveBeenCalledWith(el, { n: 2 }));
});

it("does not mount when cleanup comes before the gate opens", async () => {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  const mount = vi.fn(() => () => {});
  const handle = lazyMount(async () => mount, gate)(document.createElement("div"), {});
  if (typeof handle === "function") throw new Error("expected handle");
  handle.unmount();
  open();
  await new Promise((r) => setTimeout(r, 5));
  expect(mount).not.toHaveBeenCalled();
});
