import { type ComponentType, createElement, type HTMLAttributes, type ReactNode } from "react";
import { type BlocksEdit, editBlock } from "../../preview/runtime/bind-elements.ts";
import { type PrimitiveProps, renderPrimitive } from "./primitive.ts";

export type { BlocksEdit } from "../../preview/runtime/bind-elements.ts";

type Block = { id?: string; blockType: string };

/** The props of a block component. `edit(path)` is the `data-cms` value of a field inside the block. */
export type BlockProps<B = Record<string, unknown>> = {
  block: B & Block;
  edit: (path?: string) => string | undefined;
};

export type BlocksProps = PrimitiveProps &
  HTMLAttributes<HTMLElement> & {
    blocks?: readonly Block[] | null;
    components: Record<string, ComponentType<BlockProps<any>>>;
    edit?: BlocksEdit;
    children?: ReactNode;
  };

/**
 * Renders each block with the component of its `blockType`, with the props `block` and `edit`. A type without a
 * component renders nothing. Without the `edit` prop, `edit()` returns `undefined`. Uses no hooks or context, so it
 * also renders in server components.
 * @example
 * <Blocks blocks={page.content} components={{ hero: Hero }} edit={{ collection: "pages", id: page.id, path: "content" }} />
 */
export function Blocks({
  blocks,
  components,
  edit,
  as = "div",
  asChild,
  children,
  ...attrs
}: BlocksProps) {
  const content = (blocks ?? []).map((block, index) => {
    const component = components[block.blockType];
    if (!component) return null;
    const bind = (path?: string) => editBlock(edit, blocks, block, path);
    return createElement(component, { key: block.id ?? index, block, edit: bind });
  });
  return renderPrimitive(as, asChild, attrs, content, children);
}
