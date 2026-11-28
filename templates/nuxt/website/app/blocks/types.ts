import type { BlockOf, DocumentOf } from "tenoncms/client";

type Content = DocumentOf<"pages">["content"];

/** The props `<Blocks>` passes to the component of block type `T`. */
export type BlockProps<T extends BlockOf<Content>["blockType"]> = {
  block: BlockOf<Content, T>;
  /** The `data-cms` value of a field inside the block, for live preview. */
  edit: (path?: string) => string | undefined;
};
