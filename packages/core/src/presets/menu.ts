// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import type { Block, BlocksField, Fields } from "../schema/index.ts";

type MenuBlockName<K> = `menu${Capitalize<K & string>}`;

/** Blocks of the host, keyed by `blockType`. `link` and `heading` are the preset's own. */
type MenuBlocks = Record<string, Block> & { link?: never; heading?: never };

type BlockMap = Record<string, Block | string>;

/**
 * A menu editor for a global: put `fields` into the global's fields and `blocks` into `defineCms({ blocks })`. Read it
 * with `menuItems()` from `tenoncms` or `tenoncms/client`.
 * - `menuLink`: a link with an optional label. It MAY hold links and headings.
 * - `menuHeading`: a label that groups links. It is never required and needs `depth` of 1 or more.
 * - `options.blocks`: blocks of the host. Each goes wherever a link goes. Unlimited menus share it as `menu<Key>`, so
 *   `button` becomes `menuButton`.
 * - `options.depth`: the levels of children below the top. `0` (default) is flat, `1` allows one level, `-1` is
 *   unlimited. A heading counts as a level. Only an unlimited menu needs `blocks`: a block can contain itself only by
 *   name, so it is shared and a change to it applies at every depth. A finite menu nests the blocks inline and its
 *   `blocks` is empty.
 *
 * Customize the blocks with plain spreads: `{ ...blocks.menuLink, fields: { ...blocks.menuLink.fields, icon } }`.
 */
export function menu<const B extends MenuBlocks = {}, const D extends number = 0>(
  options: { depth?: D; blocks?: B } = {},
): Menu<B, D> {
  const shared = sharedMenu<B>(options.blocks);
  const depth = options.depth ?? 0;
  if (depth < 0) return shared as Menu<B, D>;

  // ponytail: finite menus are typed loosely. Exact types per depth need a type-level counter.
  const host = options.blocks ?? {};
  const { menuLink, menuHeading } = shared.blocks as Record<"menuLink" | "menuHeading", Block>;
  const withChildren = (block: Block, children: BlockMap): Block => ({
    ...block,
    fields: {
      ...block.fields,
      children: { ...(block.fields.children as BlocksField), blocks: children },
    },
  });
  const linksAt = (d: number): BlockMap => ({
    link:
      d > 0
        ? withChildren(menuLink, itemsAt(d - 1))
        : { ...menuLink, fields: omitChildren(menuLink.fields) },
    ...host,
  });
  const itemsAt = (d: number): BlockMap =>
    d > 0 ? { ...linksAt(d), heading: withChildren(menuHeading, linksAt(d - 1)) } : linksAt(d);

  return {
    blocks: {},
    fields: { items: { ...shared.fields.items, blocks: itemsAt(depth) } },
  } as unknown as Menu<B, D>;
}

type SharedMenu<B extends MenuBlocks> = ReturnType<typeof sharedMenu<B>>;
type Menu<B extends MenuBlocks, D extends number> = D extends -1
  ? SharedMenu<B>
  : { blocks: {}; fields: { items: BlocksField } };

/** The unlimited menu: `menuLink` and `menuHeading` as blocks that contain themselves by name. */
function sharedMenu<const B extends MenuBlocks>(blocks: B | undefined) {
  const entries = Object.entries(blocks ?? {});
  const hostBlocks = Object.fromEntries(
    entries.map(([key, block]) => [menuBlockName(key), block]),
  ) as {
    [K in keyof B as MenuBlockName<K>]: B[K];
  };
  const hostNames = Object.fromEntries(entries.map(([key]) => [key, menuBlockName(key)])) as {
    [K in keyof B]: MenuBlockName<K>;
  };
  const links = { link: "menuLink", ...hostNames } as const;
  const items = { ...links, heading: "menuHeading" } as const;

  return {
    blocks: {
      ...hostBlocks,
      menuLink: {
        label: { en: "Link", de: "Link" },
        icon: "link",
        fields: {
          label: { type: "text", label: { en: "Label", de: "Beschriftung" } },
          link: { type: "link", required: true, label: { en: "Link", de: "Link" } },
          children: {
            type: "blocks",
            label: { en: "Children", de: "Unterpunkte" },
            blocks: items,
          },
        },
      },
      menuHeading: {
        label: { en: "Heading", de: "Überschrift" },
        icon: "heading",
        fields: {
          label: { type: "text", required: true, label: { en: "Label", de: "Beschriftung" } },
          children: {
            type: "blocks",
            label: { en: "Links", de: "Links" },
            blocks: links,
          },
        },
      },
    },
    fields: {
      items: {
        type: "blocks",
        appearance: "tree",
        label: { en: "Items", de: "Einträge" },
        itemLabels: { singular: { en: "Item", de: "Eintrag" } },
        blocks: items,
      },
    },
  } as const satisfies { blocks: Record<string, Block>; fields: Fields };
}

function omitChildren({ children, ...fields }: Fields): Fields {
  return fields;
}

function menuBlockName<K extends string>(key: K): MenuBlockName<K> {
  return `menu${key.charAt(0).toUpperCase()}${key.slice(1)}` as MenuBlockName<K>;
}
