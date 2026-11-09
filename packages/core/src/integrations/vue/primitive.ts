import { cloneVNode, Comment, type Component, h, type PropType, type VNode } from "vue";

/** `as` and `asChild`, like reka-ui's primitives. */
export const primitiveProps = {
  /** The element or component to render. */
  as: { type: [String, Object, Function] as PropType<string | Component>, default: "div" },
  /** Renders no element of its own: its props and attributes merge into the only child of the default slot. */
  asChild: Boolean,
};

/**
 * Renders `as` with `props` and `children`, or with `asChild` merges `props` into the first child of `slot`. Class,
 * style and listeners merge; other props win over the child's.
 */
export function renderPrimitive(
  { as, asChild }: { as: string | Component; asChild: boolean },
  props: Record<string, unknown>,
  children?: () => unknown,
  slot?: () => VNode[],
) {
  if (!asChild) return h(as as string, props, children as never);
  const child = slot?.().find((node) => node.type !== Comment);
  return child ? cloneVNode(child, props, true) : null;
}
