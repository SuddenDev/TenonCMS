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

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findById: vi.fn(),
  getGlobal: vi.fn(),
  navigateTo: vi.fn(),
}));
const config = { locales: ["en", "de"], defaultLocale: "en" };
const route = reactive({ path: "/posts/hello" });
const state = new Map<string, Ref>();
const scopes: EffectScope[] = [];
const app = {};

vi.mock("#app", () => ({
  navigateTo: mocks.navigateTo,
  useNuxtApp: () => app,
  useRequestEvent: () => undefined,
  useRoute: () => route,
  useNuxtData: () => ({ data: ref(config) }),
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
    const result = { data };
    return Object.assign(
      run().then(() => result),
      result,
    );
  },
}));
vi.mock("integral-cms/client", () => ({
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
vi.mock("integral-cms/preview", () => ({
  getDrafts: () => [],
  merge: (_collection: string, doc: unknown) => doc,
  subscribe: () => () => {},
}));

import { useAlternates, useIntegral, useLocale } from "./runtime/composables.ts";

function setup<T>(fn: () => T): T {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(fn)!;
}

beforeEach(() => {
  route.path = "/posts/hello";
  state.clear();
  vi.clearAllMocks();
  mocks.find.mockImplementation(async (_collection, options) => [
    { id: options.where?.slug ?? "page", ...options },
  ]);
  mocks.findById.mockImplementation(async (_collection, id, options) => ({ id, ...options }));
  mocks.getGlobal.mockImplementation(async (_name, options) => options);
});
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
});

it("updates a reused page's document and alternates in the route's locale", async () => {
  const slug = computed(() => route.path.split("/").at(-1)!);
  const result = await setup(() =>
    useIntegral().findOne("posts", () => ({
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
    const cms = useIntegral();
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
  const result = await setup(() => useIntegral().findById("posts", id));
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
