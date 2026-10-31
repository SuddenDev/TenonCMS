// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import type { Block, Fields } from "../schema/index.ts";

type MenuBlockName<K> = `menu${Capitalize<K & string>}`;

/** Blocks of the host, keyed by `blockType`. `link` and `heading` are the preset's own. */
type MenuBlocks = Record<string, Block> & { link?: never; heading?: never };

/**
 * A menu editor for a global: spread `blocks` into `defineCms({ blocks })` and `fields` into the global's fields. Read
 * it with `menuItems()` from `tenoncms` or `tenoncms/client`.
 * - `menuLink`: a link with an optional label. It MAY hold links and headings.
 * - `menuHeading`: a label that groups links. It is never required.
 * - `options.blocks`: blocks of the host. Each goes wherever a link goes and is shared as `menu<Key>`, so `button`
 *   becomes `menuButton`.
 *
 * The blocks are shared, because `menuLink` contains itself, so a change to one applies at every depth. Customize them
 * with plain spreads: `{ ...blocks.menuLink, fields: { ...blocks.menuLink.fields, icon } }`.
 */
export function menu<const B extends MenuBlocks = {}>(options: { blocks?: B } = {}) {
  const entries = Object.entries(options.blocks ?? {});
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
        labels: { singular: { en: "Item", de: "Eintrag" } },
        blocks: items,
      },
    },
  } as const satisfies { blocks: Record<string, Block>; fields: Fields };
}

function menuBlockName<K extends string>(key: K): MenuBlockName<K> {
  return `menu${key.charAt(0).toUpperCase()}${key.slice(1)}` as MenuBlockName<K>;
}
