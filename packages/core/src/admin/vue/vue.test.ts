// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { renderVue } from "./vue.ts";

const Show = defineComponent({
  props: { data: { type: null, default: undefined }, value: { type: null, default: undefined } },
  setup: (props) => () => h("p", `${JSON.stringify(props.data)}|${props.value}`),
});

it("passes data as a prop, updates it and cleans up", async () => {
  const el = document.createElement("div");
  const handle = renderVue(Show)(el, { data: { n: 1 }, value: "a" });
  if (typeof handle === "function") throw new Error("expected handle");
  await nextTick();
  expect(el.textContent).toBe('{"n":1}|a');
  handle.update!({ data: { n: 2 }, value: "a" });
  await nextTick();
  expect(el.textContent).toBe('{"n":2}|a');
  handle.unmount();
  expect(el.textContent).toBe("");
});
