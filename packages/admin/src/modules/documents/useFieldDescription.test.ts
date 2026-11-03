import { effectScope, nextTick, ref } from "vue";
import { expect, it } from "vitest";
import { useFieldDescription } from "./useFieldDescription";
import type { FieldDescription } from "../../../../core/src/admin/index.d.ts";

const context = (value: number) => ({
  value,
  data: {},
  siblings: {},
  path: "price",
  locale: "en" as const,
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
};

it("evaluates against the latest value after loading and updates without reloading", async () => {
  let resolve!: (fn: FieldDescription) => void;
  let loads = 0;
  const value = ref(10);
  const scope = effectScope();
  const help = scope.run(() =>
    useFieldDescription(
      () => ({ clientRef: "price" }),
      () => context(value.value),
      {
        price: () => {
          loads++;
          return new Promise<FieldDescription>((done) => {
            resolve = done;
          });
        },
      },
    ),
  )!;
  expect(help.value).toEqual({});
  value.value = 2000;
  resolve(({ value }) => (value > 1000 ? "Approval" : "Price"));
  await flush();
  expect(help.value.text).toBe("Approval");
  value.value = 20;
  expect(help.value.text).toBe("Price");
  expect(loads).toBe(1);
  scope.stop();
});

it("ignores a stale load when the reference changes", async () => {
  let resolve!: (fn: FieldDescription) => void;
  const source = ref({ clientRef: "first" });
  const scope = effectScope();
  const help = scope.run(() =>
    useFieldDescription(
      () => source.value,
      () => context(0),
      {
        first: () =>
          new Promise<FieldDescription>((done) => {
            resolve = done;
          }),
        second: async () => () => "Second",
      },
    ),
  )!;
  source.value = { clientRef: "second" };
  await nextTick();
  await flush();
  resolve(() => "Stale");
  await flush();
  expect(help.value.text).toBe("Second");
  scope.stop();
});

it("reports missing exports and callback errors without breaking the field", async () => {
  const source = ref<any>({ clientRef: "missing" });
  const scope = effectScope();
  const help = scope.run(() =>
    useFieldDescription(
      () => source.value,
      () => context(0),
      {},
    ),
  )!;
  await flush();
  expect(help.value.error?.message).toContain("not discovered");
  source.value = () => {
    throw new Error("Bad help");
  };
  await nextTick();
  expect(help.value.error?.message).toBe("Bad help");
  source.value = () => Promise.resolve("Async");
  await nextTick();
  expect(help.value.error?.message).toContain("synchronously");
  source.value = { en: "Help", de: "Hilfe" };
  await nextTick();
  expect(help.value).toEqual({ text: { en: "Help", de: "Hilfe" } });
  scope.stop();
});
