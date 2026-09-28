import { createElement, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import type { Mount } from "./index.d.ts";

export type { FieldContext, IntegralContext, Mount, PageContext } from "./index.d.ts";

/**
 * Turns a React component into a {@link Mount} for `integral.admin.ts`.
 *
 * The context arrives as props. The component re-renders on every context change, e.g. a new route.
 * @example
 * // integral.admin.ts
 * pages: { stats: { label: 'Stats', mount: renderReact(Stats) } }
 *
 * // admin.tsx
 * export function Stats({ params, integral }: PageContext) { … }
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
