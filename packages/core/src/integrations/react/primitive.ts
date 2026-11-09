import {
  Children,
  cloneElement,
  createElement,
  type ElementType,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

/** `as` and `asChild`, for components that render one element. */
export type PrimitiveProps = {
  /** The element or component to render. */
  as?: ElementType;
  /** Renders no element of its own: its props merge into the only child element. */
  asChild?: boolean;
};

type Props = Record<string, any>;

/**
 * Renders `as` with `props` and `content`, or with `asChild` merges `props` into the first element of `children`,
 * with `content` as its children when given. Class names join, styles merge, both handlers run; other props win
 * over the child's.
 */
export function renderPrimitive(
  as: ElementType,
  asChild: boolean | undefined,
  props: Props,
  content?: ReactNode,
  children?: ReactNode,
) {
  if (!asChild) return createElement(as, props, content);
  const child = Children.toArray(children).find(isValidElement) as ReactElement<Props> | undefined;
  if (!child) return null;
  const merged = mergeProps(child.props, props);
  return content === undefined ? cloneElement(child, merged) : cloneElement(child, merged, content);
}

function mergeProps(child: Props, own: Props): Props {
  const merged = { ...child, ...own };
  if (child.className && own.className) merged.className = `${child.className} ${own.className}`;
  if (child.style && own.style) merged.style = { ...child.style, ...own.style };
  for (const key of Object.keys(own)) {
    if (!/^on[A-Z]/.test(key) || typeof child[key] !== "function") continue;
    merged[key] = (...args: unknown[]) => {
      child[key](...args);
      own[key](...args);
    };
  }
  return merged;
}
