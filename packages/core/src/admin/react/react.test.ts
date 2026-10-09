// @vitest-environment happy-dom
import { act, createElement } from "react";
import { expect, it } from "vitest";
import { renderReact } from "./react.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Show = ({ data }: { data?: unknown }) => createElement("p", null, JSON.stringify(data));

it("passes data as a prop, updates it and cleans up", async () => {
  const el = document.createElement("div");
  const handle = renderReact(Show)(el, { data: { n: 1 } });
  if (typeof handle === "function") throw new Error("expected handle");
  await act(async () => {});
  expect(el.textContent).toBe('{"n":1}');
  await act(async () => handle.update!({ data: { n: 2 } }));
  expect(el.textContent).toBe('{"n":2}');
  await act(async () => handle.unmount());
  expect(el.textContent).toBe("");
});
