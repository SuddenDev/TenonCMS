// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import { client, schema } from "@/shared/api";
import { integralKey, registryKey, sessionKey } from "@/shared/options";
import { ownerKey, type Owner } from "@/modules/documents/fields";
import FieldInput from "./FieldInput.vue";

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  vi.restoreAllMocks();
  schema.value = {};
});

type Call = { body: any; resolve: (data: unknown) => void };

function setup(load = true) {
  const calls: Call[] = [];
  vi.spyOn(client, "request").mockImplementation(
    (_path, init) =>
      new Promise((resolve) => {
        calls.push({ body: init?.body, resolve: (data) => resolve({ data }) });
      }) as never,
  );
  const handle = { update: vi.fn(), unmount: vi.fn() };
  const mount = vi.fn((_el: HTMLElement, _ctx: any) => handle);
  schema.value = {
    admin: {
      fields: { color: { mount: { clientRef: "color" }, ...(load && { load: true as const }) } },
      pages: {},
    },
  };
  const owner = ref<Owner>({ collection: "posts" });
  const value = ref("red");
  const shown = ref(true);
  const root = document.createElement("div");
  document.body.append(root);
  app = createApp({
    render: () =>
      shown.value
        ? h(FieldInput, {
            name: "color",
            path: "seo.color",
            field: { type: "custom:color" } as never,
            root: {},
            siblings: { fields: {}, data: {} },
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
          })
        : null,
  })
    .provide(registryKey, { color: async () => mount })
    .provide(integralKey, { base: "/admin", navigate: vi.fn(), reload: async () => {} })
    .provide(sessionKey, { expire: vi.fn() } as never)
    .provide(ownerKey, owner);
  app.mount(root);
  return { calls, mount, handle, owner, value, shown };
}

it("asks for the data with the field's type, full path and owner, and mounts with it", async () => {
  const { calls, mount } = setup();
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toEqual({
    kind: "field",
    type: "color",
    path: "seo.color",
    owner: { collection: "posts" },
  });
  calls[0].resolve({ palette: ["red"] });
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  expect(mount.mock.calls[0][1]).toMatchObject({ value: "red", data: { palette: ["red"] } });
});

it("does not request again when the value changes", async () => {
  const { calls, mount, handle, value } = setup();
  calls[0].resolve(1);
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  value.value = "blue";
  await nextTick();
  await vi.waitFor(() =>
    expect(handle.update).toHaveBeenCalledWith(expect.objectContaining({ value: "blue", data: 1 })),
  );
  expect(calls).toHaveLength(1);
});

it("reloads when a new document gets its id", async () => {
  const { calls, mount, handle, owner } = setup();
  calls[0].resolve(1);
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  owner.value = { collection: "posts", id: "7" };
  await nextTick();
  expect(calls).toHaveLength(2);
  expect(calls[1].body.owner).toEqual({ collection: "posts", id: "7" });
  calls[1].resolve(2);
  await vi.waitFor(() =>
    expect(handle.update).toHaveBeenCalledWith(expect.objectContaining({ data: 2 })),
  );
  expect(mount).toHaveBeenCalledOnce();
});

it("cleans up and ignores the pending response when the field is removed", async () => {
  const { calls, mount, shown } = setup();
  shown.value = false;
  await nextTick();
  calls[0].resolve(1);
  await new Promise((r) => setTimeout(r, 10));
  expect(mount).not.toHaveBeenCalled();
});

it("sends no request for a field registration without a loader", async () => {
  const { calls, mount } = setup(false);
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  expect(calls).toHaveLength(0);
  expect(mount.mock.calls[0][1].data).toBeUndefined();
});
