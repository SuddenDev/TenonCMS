import {
  type Component,
  defineComponent,
  h,
  inject,
  type InjectionKey,
  type PropType,
  provide,
} from "vue";
import { type BlocksEdit, editBlock } from "../../preview/runtime/bind-elements.ts";
import { primitiveProps, renderPrimitive } from "./primitive.ts";

type Block = { id?: string; blockType: string };

export type { BlocksEdit } from "../../preview/runtime/bind-elements.ts";

const editKey: InjectionKey<(block: { id?: string }, path?: string) => string | undefined> =
  Symbol("tenon-blocks");

/**
 * Renders each block with the component of its `blockType`, as `<component :block>`. A type without a component
 * renders nothing. With `edit`, the blocks below get `data-cms` values from {@link useBlockEdit}.
 * @example
 * <Blocks :blocks="page.content" :components="{ hero: Hero }" :edit="{ collection: 'pages', id: page.id, path: 'content' }" />
 */
export const Blocks = defineComponent({
  name: "Blocks",
  inheritAttrs: false,
  props: {
    blocks: Array as PropType<readonly Block[] | null>,
    components: { type: Object as PropType<Record<string, Component>>, required: true },
    edit: Object as PropType<BlocksEdit>,
    ...primitiveProps,
  },
  setup(props, { attrs, slots }) {
    provide(editKey, (block, path) => editBlock(props.edit, props.blocks, block, path));

    return () =>
      renderPrimitive(
        props,
        attrs,
        () =>
          (props.blocks ?? []).flatMap((block, index) => {
            const component = props.components[block.blockType];
            return component ? [h(component, { key: block.id ?? index, block })] : [];
          }),
        slots.default,
      );
  },
});

/**
 * The `data-cms` value of a field inside `block`, for click-to-edit in the live preview. Without a path it binds the
 * block itself. `undefined` outside {@link Blocks} or without its `edit` prop.
 * @example
 * const edit = useBlockEdit(props.block)
 * // <h2 :data-cms="edit('title')">{{ block.title }}</h2>
 */
export function useBlockEdit(block: { id?: string }) {
  const bind = inject(editKey, undefined);
  return (path?: string) => bind?.(block, path);
}
