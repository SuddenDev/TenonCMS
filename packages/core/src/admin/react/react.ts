import { createElement, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import type { Mount } from "../index";

export type { FieldContext, TenonContext, Mount, PageContext } from "../index";

/**
 * Turns a React component into a {@link Mount}.
 *
 * The context arrives as props. The component re-renders on every context change, e.g. a new route.
 * @example
 * // stats.ts, registered with clientRef('./stats.ts#mountStats')
 * export const mountStats = renderReact(Stats)
 *
 * // admin.tsx
 * export function Stats({ params, tenon }: PageContext) { … }
 */
export function renderReact<Ctx extends object>(Component: ComponentType<Ctx>): Mount<Ctx> {
  return (el, ctx) => {
    const root = createRoot(el);
    root.render(createElement(Component, ctx));
    return {
      update: (ctx) => root.render(createElement(Component, ctx)),
      unmount: () => root.unmount(),
    };
  };
}
