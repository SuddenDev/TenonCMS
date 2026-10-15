// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, ref, shallowRef, type App } from "vue";
import { i18n } from "@/shared/i18n";
import { integralKey, registryKey } from "@/shared/options";
import Mount from "./Mount.vue";

let app: App | undefined;
let root: HTMLElement;

afterEach(() => {
  app?.unmount();
  root?.remove();
});

const integral = { base: "/admin", navigate: vi.fn(), reload: async () => {} };

function loader() {
  return {
    result: shallowRef<{ request: object; data: unknown }>(),
    loading: ref(false),
    error: ref<Error>(),
    reload: vi.fn(async () => {}),
  };
}

function render(
  props: () => Record<string, unknown>,
  registry: Record<string, () => Promise<unknown>> = {},
) {
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(Mount, props() as never) })
    .use(i18n)
    .provide(registryKey, registry)
    .provide(integralKey, integral);
  app.mount(root);
}

const handle = () => ({ update: vi.fn(), unmount: vi.fn() });

it("mounts at once without a loader, with data undefined and a no-op reload", async () => {
  const mount = vi.fn(() => handle());
  render(() => ({ mount, ctx: { value: 1 } }));
  expect(mount).toHaveBeenCalledOnce();
  const ctx = (mount.mock.calls[0] as any)[1];
  expect(ctx).toMatchObject({ value: 1 });
  expect(ctx.data).toBeUndefined();
  await expect(ctx.integral.reload()).resolves.toBeUndefined();
  expect(root.querySelector("[role=status]")).toBeNull();
});

it("passes the admin language and updates the mount when it changes", async () => {
  const h = handle();
  const mount = vi.fn(() => h);
  render(() => ({ mount, ctx: {} }));
  expect((mount.mock.calls[0] as any)[1].integral.locale).toBe("en");
  i18n.global.locale.value = "de";
  await vi.waitFor(() =>
    expect(h.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ integral: expect.objectContaining({ locale: "de" }) }),
    ),
  );
  i18n.global.locale.value = "en";
});

it("waits for code and data, shows a status meanwhile, then mounts once", async () => {
  const l = loader();
  const mount = vi.fn(() => handle());
  let release!: () => void;
  const code = new Promise<void>((r) => (release = r));
  render(() => ({ mount: { clientRef: "x" }, ctx: { a: 1 }, loader: l }), {
    x: async () => {
      await code;
      return mount;
    },
  });
  l.loading.value = true;
  await nextTick();
  expect(root.querySelector("[role=status]")?.textContent).toContain("Loading");
  expect(root.firstElementChild?.getAttribute("aria-busy")).toBe("true");
  l.result.value = { request: {}, data: { n: 1 } };
  await nextTick();
  await new Promise((r) => setTimeout(r, 5));
  expect(mount).not.toHaveBeenCalled();
  release();
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  expect((mount.mock.calls[0] as any)[1]).toMatchObject({ a: 1, data: { n: 1 } });
  l.loading.value = false;
  await nextTick();
  expect(root.querySelector("[role=status]")).toBeNull();
  expect(root.firstElementChild?.hasAttribute("aria-busy")).toBe(false);
});

it("updates the existing handle when new data arrives", async () => {
  const l = loader();
  const h1 = handle();
  const mount = vi.fn(() => h1);
  l.result.value = { request: {}, data: 1 };
  render(() => ({ mount: { clientRef: "x" }, ctx: {}, loader: l }), { x: async () => mount });
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  l.result.value = { request: {}, data: 2 };
  await nextTick();
  expect(mount).toHaveBeenCalledOnce();
  expect(h1.update).toHaveBeenCalledWith(expect.objectContaining({ data: 2 }));
});

it("passes value edits with the last data without a request, and reloads through integral.reload", async () => {
  const l = loader();
  const h1 = handle();
  const mount = vi.fn(() => h1);
  const ctx = ref({ value: "a" });
  l.result.value = { request: {}, data: 1 };
  render(() => ({ mount: { clientRef: "x" }, ctx: ctx.value, loader: l }), {
    x: async () => mount,
  });
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  ctx.value = { value: "b" };
  await nextTick();
  expect(h1.update).toHaveBeenCalledWith(expect.objectContaining({ value: "b", data: 1 }));
  expect(l.reload).not.toHaveBeenCalled();
  await (mount.mock.calls[0] as any)[1].integral.reload();
  expect(l.reload).toHaveBeenCalledOnce();
});

it("shows an alert with a retry on a load error", async () => {
  const l = loader();
  const mount = vi.fn(() => handle());
  render(() => ({ mount, ctx: {}, loader: l }));
  l.error.value = new Error("Could not load");
  await nextTick();
  const alert = root.querySelector("[role=alert]")!;
  expect(alert.textContent).toContain("Could not load");
  expect(root.querySelector("[role=status]")).toBeNull();
  alert.querySelector("button")!.click();
  expect(l.reload).toHaveBeenCalledOnce();
  expect(mount).not.toHaveBeenCalled();
});

it("does not mount when removed before code and data load", async () => {
  const l = loader();
  const mount = vi.fn(() => handle());
  render(() => ({ mount: { clientRef: "x" }, ctx: {}, loader: l }), { x: async () => mount });
  app!.unmount();
  l.result.value = { request: {}, data: 1 };
  await new Promise((r) => setTimeout(r, 10));
  expect(mount).not.toHaveBeenCalled();
});
