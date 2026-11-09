import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  effectScope,
  nextTick,
  reactive,
  ref,
  toValue,
  watch,
  type EffectScope,
  type Ref,
} from "vue";
import { localeFromPath, localizePath, switchTarget } from "../../helpers/locale-path.ts";
import { seoMeta } from "../../helpers/seo-meta.ts";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findById: vi.fn(),
  getGlobal: vi.fn(),
  navigateTo: vi.fn(),
  useSeoMeta: vi.fn(),
  useHead: vi.fn(),
  event: undefined as { headers: Headers } | undefined,
}));
const config = { locales: ["en", "de"], defaultLocale: "en" };
const route = reactive({ path: "/posts/hello" });
const state = new Map<string, Ref>();
const scopes: EffectScope[] = [];
const app = {};

vi.mock("#app", () => ({
  navigateTo: mocks.navigateTo,
  useSeoMeta: mocks.useSeoMeta,
  useHead: mocks.useHead,
  useNuxtApp: () => app,
  useRequestEvent: () => mocks.event,
  onNuxtReady: () => {},
  useRoute: () => route,
  useState: (key: string, init: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(init()));
    return state.get(key);
  },
  useAsyncData: (key: string | (() => string), read: () => Promise<unknown>) => {
    const data = ref<unknown>();
    const run = async () => {
      data.value = await read();
    };
    watch(() => toValue(key), run);
    // Nuxt 4.6 sets bound `then`, `catch` and `finally` as enumerable own properties.
    const result = { data };
    const promise = Object.assign(
      run().then(() => result),
      result,
    );
    for (const method of ["then", "catch", "finally"] as const)
      Object.defineProperty(promise, method, {
        enumerable: true,
        value: promise[method].bind(promise),
      });
    return promise;
  },
}));
vi.mock("tenoncms/client", () => ({
  seoMeta,
  localeFromPath,
  localizePath,
  switchTarget,
  createClient: () => ({
    localization: async () => config,
    find: mocks.find,
    findOne: async (collection: string, options: object) =>
      (await mocks.find(collection, options))[0],
    findById: mocks.findById,
    getGlobal: mocks.getGlobal,
  }),
}));
vi.mock("tenoncms/preview", async () => {
  const { getDrafts, setReadDocuments, subscribe } = await import("../../preview/runtime/store.ts");
  const { merge } = await import("../../preview/runtime/merge-draft.ts");
  const { isLivePreview } = await import("../../preview/runtime/preview.ts");
  return { getDrafts, isLivePreview, merge, setReadDocuments, subscribe };
});

import { readDocuments, setDraft } from "../../preview/runtime/store.ts";
import {
  useAlternates,
  useLivePreview,
  useTenon,
  useTenonSeo,
  useLocale,
} from "./runtime/composables.ts";

function setup<T>(fn: () => T): T {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(fn)!;
}

beforeEach(() => {
  route.path = "/posts/hello";
  state.clear();
  state.set("tenon:localization", ref(config));
  vi.clearAllMocks();
  mocks.find.mockImplementation(async (_collection, options) => [
    { id: options.where?.slug ?? "page", ...options },
  ]);
  mocks.findById.mockImplementation(async (_collection, id, options) => ({ id, ...options }));
  mocks.getGlobal.mockImplementation(async (_name, options) => options);
});
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.unstubAllGlobals();
  mocks.event = undefined;
});

it("detects the admin's iframe during SSR", () => {
  mocks.event = {
    headers: new Headers({ "sec-fetch-dest": "iframe", cookie: "tenon-session=1" }),
  };
  expect(setup(() => useLivePreview()).value).toBe(true);
  state.clear();
  mocks.event = { headers: new Headers({ "sec-fetch-dest": "document" }) };
  expect(setup(() => useLivePreview()).value).toBe(false);
});

it("shows the admin's draft in an awaited read", async () => {
  vi.stubGlobal("window", globalThis);
  // Vue compiles `await` in `<script setup>` to `withAsyncContext()`, which chains through `catch`.
  const { data } = await setup(() =>
    useTenon().findOne("posts", { where: { slug: "hello" } }),
  ).catch((error) => {
    throw error;
  });
  setDraft("posts", "hello", { title: "Draft", locale: "en" });
  expect(data.value).toMatchObject({ id: "hello", title: "Draft" });
});

it("registers the documents a page reads until the page is gone", async () => {
  vi.stubGlobal("window", globalThis);
  await Promise.all(
    setup(() => {
      const cms = useTenon();
      return [cms.find("pages"), cms.getGlobal("general")];
    }),
  );
  expect(readDocuments()).toEqual([
    { collection: "pages", id: "page" },
    { collection: "general", id: "" },
  ]);
  scopes.splice(0).forEach((scope) => scope.stop());
  expect(readDocuments()).toEqual([]);
});

it("reuses reads on navigation within one locale", async () => {
  const general = await setup(() => useTenon().getGlobal("general"));
  route.path = "/about";
  await nextTick();
  expect(mocks.getGlobal).toHaveBeenCalledTimes(1);
  expect(general.data.value).toMatchObject({ locale: "en" });
});

it("reads without a locale when localization is off", async () => {
  state.set("tenon:localization", ref(null));
  const general = await setup(() => useTenon().getGlobal("general"));
  route.path = "/about";
  await nextTick();
  expect(mocks.getGlobal).toHaveBeenCalledTimes(1);
  expect(mocks.getGlobal).toHaveBeenCalledWith("general", {});
});

it("updates a reused page's document and alternates in the route's locale", async () => {
  const slug = computed(() => route.path.split("/").at(-1)!);
  const result = await setup(() =>
    useTenon().findOne("posts", () => ({
      where: { slug: slug.value },
      alternates: true,
    })),
  );
  expect(result.data.value).toMatchObject({ id: "hello", locale: "en", alternates: true });
  route.path = "/de/posts/hallo";
  await vi.waitFor(() =>
    expect(result.data.value).toMatchObject({ id: "hallo", locale: "de", alternates: true }),
  );
  expect(mocks.find).toHaveBeenCalledTimes(2);
});

it("updates ordinary reads on locale navigation and preserves an explicit locale", async () => {
  const results = setup(() => {
    const cms = useTenon();
    return [cms.find("pages"), cms.getGlobal("general"), cms.find("pages", { locale: "en" })];
  });
  const [pages, general, fixed] = await Promise.all(results);
  route.path = "/de/posts/hallo";
  await vi.waitFor(() => {
    expect(pages.data.value).toMatchObject([{ locale: "de" }]);
    expect(general.data.value).toMatchObject({ locale: "de" });
  });
  expect(fixed.data.value).toMatchObject([{ locale: "en" }]);
  expect(mocks.find).toHaveBeenCalledTimes(3);
});

it("updates a document read when its id changes", async () => {
  const id = ref("one");
  const result = await setup(() => useTenon().findById("posts", id));
  expect(mocks.findById).toHaveBeenLastCalledWith("posts", "one", { locale: "en" });
  expect(result.data.value).toMatchObject({ id: "one" });
  id.value = "two";
  await vi.waitFor(() => expect(result.data.value).toMatchObject({ id: "two" }));
  expect(mocks.findById).toHaveBeenLastCalledWith("posts", "two", { locale: "en" });
});

it("shares reactive translation links and keeps a new page's registration when the old one disposes", async () => {
  const first = ref<Record<string, string> | null>({ de: "/de/erste" });
  setup(() => useAlternates(() => first.value));
  const locale = setup(() => useLocale());
  await nextTick();
  expect(locale.switchLocalePath("de")).toBe("/de/erste");
  locale.switchLocale("de");
  expect(mocks.navigateTo).toHaveBeenLastCalledWith("/de/erste");
  first.value = { de: "/de/neu" };
  await nextTick();
  expect(locale.switchLocalePath("de")).toBe("/de/neu");
  locale.switchLocale("de");
  expect(mocks.navigateTo).toHaveBeenLastCalledWith("/de/neu");
  setup(() => useAlternates(() => ({ de: "/de/zweite" })));
  await nextTick();
  scopes[0].stop();
  locale.switchLocale("de");
  expect(mocks.navigateTo).toHaveBeenLastCalledWith("/de/zweite");
  scopes.at(-1)!.stop();
  locale.switchLocale("de");
  expect(mocks.navigateTo).toHaveBeenLastCalledWith("/de");
});

it("puts the page's SEO tags and translations into the head", async () => {
  mocks.getGlobal.mockImplementation(async (name: string) =>
    name === "general" ? { title: "Acme", url: "https://a.co" } : { noindex: false },
  );
  const alternates = { en: "/posts/hello", de: "/de/posts/hallo", "x-default": "/posts/hello" };
  const page = ref({ title: "Hello", path: "/posts/hello", locale: "en", alternates });

  const meta = await setup(() => useTenonSeo(page));
  expect(meta.value.title).toBe("Hello · Acme");

  const tags = mocks.useSeoMeta.mock.calls[0]![0];
  expect([tags.title(), tags.ogUrl(), tags.ogSiteName(), tags.robots()]).toEqual([
    "Hello · Acme",
    "https://a.co/posts/hello",
    "Acme",
    undefined,
  ]);
  expect(mocks.useHead.mock.calls[0]![0]().link).toEqual([
    { rel: "canonical", href: "https://a.co/posts/hello" },
    { rel: "alternate", hreflang: "en", href: "https://a.co/posts/hello" },
    { rel: "alternate", hreflang: "de", href: "https://a.co/de/posts/hallo" },
    { rel: "alternate", hreflang: "x-default", href: "https://a.co/posts/hello" },
  ]);
  expect(state.get("tenon:alternates")?.value).toEqual(alternates);

  page.value = { ...page.value, seo: { noindex: true } } as never;
  expect(tags.robots()).toBe("noindex, nofollow");
});
