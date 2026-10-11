// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createHead } from "@unhead/vue/client";
import { createApp, h, nextTick, shallowRef, type App } from "vue";
import { RouterView } from "vue-router";
import { client, CmsError } from "@/shared/api";
import PageTitle from "@/shared/components/navigation/PageTitle.vue";
import { integralKey, pageDataKey, registryKey, sessionKey } from "@/shared/options";
import { addAdminPages, createAdminRouter } from "./router";

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});

it("resolves an authenticated custom page when its URL is already open", async () => {
  const router = createAdminRouter("/admin");
  await router.push("/stats?range=week");
  expect(router.currentRoute.value.name).toBe("builtin:/:pathMatch(.*)*");
  await addAdminPages(router, {
    stats: { mount: { clientRef: "stats" }, nav: { display: "main" } },
  });
  expect(router.currentRoute.value.name).toBe("admin-page:stats");
  expect(router.currentRoute.value.query.range).toBe("week");
});

it("resolves a custom home page after the initial built-in redirect", async () => {
  const router = createAdminRouter("/admin");
  await router.push("/");
  expect(router.currentRoute.value.path).toBe("/content");
  await addAdminPages(router, {
    home: { route: "/", mount: { clientRef: "home" }, nav: { display: "main" } },
  });
  expect(router.currentRoute.value.name).toBe("admin-page:home");
  expect(router.currentRoute.value.path).toBe("/");
});

it("shows the page title as text by default, without breadcrumbs", async () => {
  const router = createAdminRouter("/admin");
  await router.push("/content/stats");
  await addAdminPages(router, { stats: { title: "Stats", mount: { clientRef: "stats" } } });
  const root = document.createElement("div");
  app = createApp({ render: () => h(PageTitle, { value: true }) })
    .use(router)
    .provide(integralKey, { base: "/admin", navigate: vi.fn(), reload: async () => {} });
  app.mount(root);
  await nextTick();
  expect(root.textContent).toBe("Stats");
  expect(root.querySelector("[data-slot=breadcrumb]")).toBeNull();
});

type Call = { body: any; resolve: (data: unknown) => void; reject: (error: unknown) => void };

// A custom page with a server loader and a header callback, mounted next to its title like the layout does.
async function loaded(options: { load?: true } = { load: true }) {
  const calls: Call[] = [];
  vi.spyOn(client, "request").mockImplementation(
    (_path, init) =>
      new Promise((resolve, reject) => {
        calls.push({ body: init?.body, resolve: (data) => resolve({ data }), reject });
      }) as never,
  );
  const handle = { update: vi.fn(), unmount: vi.fn() };
  const mount = vi.fn((_el: HTMLElement, _ctx: any) => handle);
  const header = vi.fn(
    (_crumbs: unknown, ctx: any) => `<b>${ctx.query.tab}:${JSON.stringify(ctx.data)}</b>`,
  );
  const expire = vi.fn();
  const router = createAdminRouter("/admin");
  await router.push("/stats?tab=a");
  await addAdminPages(router, {
    stats: {
      mount: { clientRef: "stats" },
      pageHeader: { clientRef: "header" },
      nav: { display: "main" },
      ...options,
    },
  });
  const root = document.createElement("div");
  document.body.append(root);
  app = createApp({
    render: () =>
      h("div", [
        h("header", [h(PageTitle, { value: router.currentRoute.value.meta.pageHeader ?? true })]),
        h(RouterView),
      ]),
  })
    .use(router)
    .use(createHead())
    .provide(registryKey, { stats: async () => mount, header: async () => header })
    .provide(integralKey, { base: "/admin", navigate: vi.fn(), reload: async () => {} })
    .provide(pageDataKey, shallowRef())
    .provide(sessionKey, { expire } as never);
  app.mount(root);
  return { calls, mount, handle, header, router, root, expire };
}

it("loads once for the page and its header, then mounts with the data", async () => {
  const { calls, mount, header, root } = await loaded();
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toEqual({ kind: "page", key: "stats", params: {}, query: { tab: "a" } });
  expect(root.querySelector("[role=status]")).not.toBeNull();
  expect(mount).not.toHaveBeenCalled();
  calls[0].resolve({ n: 1 });
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  expect(mount.mock.calls[0][1]).toMatchObject({ query: { tab: "a" }, data: { n: 1 } });
  await vi.waitFor(() => expect(root.querySelector("header")!.innerHTML).toContain('a:{"n":1}'));
  expect(header.mock.calls[0][1]).toMatchObject({ data: { n: 1 } });
  expect(calls).toHaveLength(1);
});

it("holds the update on a query change until the new data arrives, then updates everything together", async () => {
  const { calls, mount, handle, header, router, root } = await loaded();
  calls[0].resolve({ n: 1 });
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  await router.push("/stats?tab=b");
  await nextTick();
  expect(calls).toHaveLength(2);
  expect(handle.update).not.toHaveBeenCalled();
  expect(root.querySelector("[aria-busy=true]")).not.toBeNull();
  await vi.waitFor(() => expect(root.querySelector("header")!.innerHTML).toContain('a:{"n":1}'));
  calls[1].resolve({ n: 2 });
  await vi.waitFor(() => expect(handle.update).toHaveBeenCalledOnce());
  expect(handle.update.mock.calls[0][0]).toMatchObject({ query: { tab: "b" }, data: { n: 2 } });
  await vi.waitFor(() => expect(root.querySelector("header")!.innerHTML).toContain('b:{"n":2}'));
  expect(mount).toHaveBeenCalledOnce();
  // The header never saw the new query with the old data, or the other way round.
  for (const [, ctx] of header.mock.calls)
    if (ctx.data) expect(ctx.query.tab === "a").toBe(ctx.data.n === 1);
  expect(root.querySelector("[aria-busy=true]")).toBeNull();
});

it("ignores a stale response when the route changed twice", async () => {
  const { calls, mount, handle, router } = await loaded();
  calls[0].resolve({ n: 0 });
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  await router.push("/stats?tab=b");
  await nextTick();
  await router.push("/stats?tab=c");
  await nextTick();
  calls[2].resolve({ n: 3 });
  await vi.waitFor(() => expect(handle.update).toHaveBeenCalledOnce());
  calls[1].resolve({ n: 2 });
  await new Promise((r) => setTimeout(r, 10));
  expect(handle.update).toHaveBeenCalledOnce();
  expect(handle.update.mock.calls[0][0]).toMatchObject({ query: { tab: "c" }, data: { n: 3 } });
});

it("does not mount when the page is left before the data arrives", async () => {
  const { calls, mount, router } = await loaded();
  await router.push("/content");
  await nextTick();
  calls[0].resolve({ n: 1 });
  await new Promise((r) => setTimeout(r, 10));
  expect(mount).not.toHaveBeenCalled();
  expect(calls).toHaveLength(1);
});

it("reloads the page through integral.reload", async () => {
  const { calls, mount, handle } = await loaded();
  calls[0].resolve({ n: 1 });
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  const done = mount.mock.calls[0][1].integral.reload();
  expect(calls).toHaveLength(2);
  calls[1].resolve({ n: 9 });
  await done;
  await vi.waitFor(() => expect(handle.update).toHaveBeenCalledOnce());
  expect(handle.update.mock.calls[0][0]).toMatchObject({ data: { n: 9 } });
});

it("shows the error with a retry, and a 401 expires the session", async () => {
  const { calls, mount, root, expire } = await loaded();
  calls[0].reject(new CmsError(500, { message: "Could not load" }));
  await vi.waitFor(() =>
    expect(root.querySelector("[role=alert]")?.textContent).toContain("Could not load"),
  );
  root.querySelector<HTMLButtonElement>("[role=alert] button")!.click();
  expect(calls).toHaveLength(2);
  calls[1].reject(new CmsError(401, { message: "Unauthorized" }));
  await vi.waitFor(() => expect(expire).toHaveBeenCalledOnce());
  expect(mount).not.toHaveBeenCalled();
});

it("sends no request for a page without a loader and gives the header the route", async () => {
  const { calls, mount, header } = await loaded({});
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  expect(calls).toHaveLength(0);
  expect(mount.mock.calls[0][1].data).toBeUndefined();
  await vi.waitFor(() => expect(header).toHaveBeenCalled());
  expect(header.mock.calls[0][1]).toMatchObject({ query: { tab: "a" } });
});
