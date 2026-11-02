import { computed, inject, type InjectionKey, provide, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import { blocksOf } from "../../../../../core/src/schema/traversal/blocks-of";
import {
  blockOf,
  canHold,
  duplicateItem,
  insertItemAt,
  type Item,
  itemTitle,
  type ListField,
  moveItemTo,
  nestedLists,
  newItem,
  removeItemAt,
} from "@/modules/documents/items";

// `path` is the item's dot path in the form, like `content.0.children.2`.
type Dragged = { path: string; item: Item; field: ListField };
type Top = { name: string; path: string; field: ListField; items: Item[] };
type ItemTree = ReturnType<typeof createItemTree>;

const itemTreeKey: InjectionKey<ItemTree> = Symbol("itemTree");

/** A place an item can move to with the "Move to" menu. `owner` is the item that holds the list, if any. */
export type MoveTarget = {
  path: string;
  key: string;
  field: ListField;
  index: number;
  depth: number;
  owner?: { item: Item; field: ListField; index: number };
};

const parentOf = (path: string) => path.slice(0, path.lastIndexOf("."));
const positionOf = (path: string) => Number(path.slice(path.lastIndexOf(".") + 1));

function createItemTree(top: () => Top) {
  // Ids of the open rows at every depth. Ids are unique in a document, so a row stays open when it moves.
  const open = reactive(new Set<string>());
  const dragged = ref<Dragged | null>(null);
  const over = ref<{ list: string; index: number } | null>(null);
  const relative = (path: string) => (path === top().path ? "" : path.slice(top().path.length + 1));

  // A list takes an item of the same block or array field, never inside the item itself, and only below `maxRows`.
  function accepts(source: Dragged, list: string, field: ListField, length: number) {
    if (field.readOnly || !canHold(field, source.field, source.item)) return false;
    if (list === source.path || list.startsWith(`${source.path}.`)) return false;
    return list === parentOf(source.path) || field.maxRows === undefined || length < field.maxRows;
  }

  function moveTo(source: string, list: string, index: number) {
    moveItemTo(top().items, relative(source), relative(list), index);
  }

  function start(e: DragEvent, source: Dragged) {
    const row = (e.target as HTMLElement).closest("li");
    if (row) e.dataTransfer?.setDragImage(row, 0, 0);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      // Firefox starts a drag only with data.
      e.dataTransfer.setData("application/x-tenon-item", source.path);
    }
    dragged.value = source;
  }

  function end() {
    dragged.value = over.value = null;
  }

  /**
   * Shows the drop position, unless the item would stay where it is.
   * @returns Whether the list takes the dragged item. When it does not, an outer list MAY take it.
   */
  function hover(list: string, field: ListField, length: number, index: number) {
    const source = dragged.value;
    if (!source || !accepts(source, list, field, length)) return false;
    const from = positionOf(source.path);
    const stays = list === parentOf(source.path) && (index === from || index === from + 1);
    over.value = stays ? null : { list, index };
    return true;
  }

  // The source row MAY unmount on the move and then sends no `dragend`, so the drop ends the drag itself.
  function drop() {
    if (dragged.value && over.value) moveTo(dragged.value.path, over.value.list, over.value.index);
    end();
  }

  /**
   * The lists the item can move to, in tree order, without its own list. An item moves to the end of a list, or right
   * after its ancestor in a list that holds one.
   */
  function targets(source: Dragged) {
    const out: MoveTarget[] = [];
    const walk = (
      path: string,
      key: string,
      field: ListField,
      items: Item[],
      depth: number,
      owner?: MoveTarget["owner"],
    ) => {
      if (path !== parentOf(source.path) && accepts(source, path, field, items.length)) {
        const index = source.path.startsWith(`${path}.`)
          ? Number(source.path.slice(path.length + 1).split(".")[0]) + 1
          : items.length;
        out.push({ path, key, field, index, depth, owner });
      }
      items.forEach((item, i) => {
        if (`${path}.${i}` === source.path) return;
        for (const l of nestedLists(field, item, `${path}.${i}`))
          walk(l.path, l.key, l.field, l.items, depth + 1, { item, field, index: i });
      });
    };
    const t = top();
    walk(t.path, t.name, t.field, t.items, 0);
    return out;
  }

  // The tree display: the path of the item in the edit sheet, and the list that waits for a block pick.
  const editing = ref<string | null>(null);
  const picking = ref<{ path: string; field: ListField; owner?: Item } | null>(null);

  /**
   * Appends a new item to the list at `list` and opens its sheet. `owner` is the item that holds the list; it expands.
   * A blocks field with more than one block asks for the block first, see `picking`.
   */
  function add(list: string, field: ListField, owner?: Item, blockType?: string) {
    const names = field.type === "blocks" ? Object.keys(blocksOf(field)) : [];
    if (field.type === "blocks" && !blockType && names.length !== 1) {
      picking.value = { path: list, field, owner };
      return;
    }

    const item = newItem(field, blockType ?? names[0]);
    const index = insertItemAt(top().items, relative(list), item);
    if (owner) open.add(owner.id);
    editing.value = `${list}.${index}`;
  }

  function pick(blockType: string) {
    const p = picking.value;
    picking.value = null;
    if (p) add(p.path, p.field, p.owner, blockType);
  }

  function duplicate(path: string, item: Item, field: ListField) {
    insertItemAt(
      top().items,
      relative(parentOf(path)),
      duplicateItem(item, field),
      positionOf(path) + 1,
    );
  }

  function remove(path: string) {
    if (editing.value === path || editing.value?.startsWith(`${path}.`)) editing.value = null;
    removeItemAt(top().items, relative(path));
  }

  return {
    open,
    dragged,
    over,
    start,
    end,
    hover,
    drop,
    moveTo,
    targets,
    editing,
    picking,
    add,
    pick,
    duplicate,
    remove,
  };
}

/**
 * The tree of the top-level list field that this list belongs to. The top list creates it, nested lists and their
 * dialogs share it, so items move across depths.
 */
export function useItemTree(top: () => Top) {
  const outer = inject(itemTreeKey, null);
  if (outer) return outer;
  const tree = createItemTree(top);
  provide(itemTreeKey, tree);
  return tree;
}

/** The tree that a nested list or an item dialog belongs to. */
export const injectItemTree = () => inject(itemTreeKey)!;

/**
 * Drop handling of one list. A row takes the drop before or after it by the half the pointer is over. The rest of the
 * list takes it at the end.
 * @returns `at`: the position of the drop placeholder in this list, or `null`.
 */
export function useListDrop(
  tree: ItemTree,
  list: () => string,
  field: () => ListField,
  length: () => number,
) {
  const at = computed(() => (tree.over.value?.list === list() ? tree.over.value.index : null));
  function take(e: DragEvent, index: number) {
    if (!tree.hover(list(), field(), length(), index)) return;
    e.preventDefault();
    e.stopPropagation();
  }
  const overRow = (e: DragEvent, i: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    take(e, e.clientY < r.top + r.height / 2 ? i : i + 1);
  };
  const overList = (e: DragEvent) => take(e, length());
  return { at, overRow, overList };
}

/** Names for rows and lists. */
export function useItemNames() {
  const { t } = useI18n();
  const listName = (field: ListField, key: string) =>
    text(field.itemLabels?.plural) ?? text(field.label) ?? key;
  // A block row shows its block label, an array row "Item 2".
  const itemName = (field: ListField, item: Item, i: number) =>
    field.type === "blocks"
      ? (text(blockOf(field, item)?.label) ?? String(item.blockType))
      : t("items.numbered", {
          label: text(field.itemLabels?.singular) ?? t("items.item"),
          n: i + 1,
        });
  // The top list shows its own name. A nested one shows the item that holds it, like "Section › Children".
  const targetName = (target: MoveTarget) => {
    const list = listName(target.field, target.key);
    if (!target.owner) return list;
    const { item, field, index } = target.owner;
    return `${itemTitle(item, field) || itemName(field, item, index)} › ${list}`;
  };
  // A tree row without a title is numbered, like "Link 3".
  const treeItemName = (field: ListField, item: Item, i: number) =>
    field.type === "blocks"
      ? t("items.numbered", { label: itemName(field, item, i), n: i + 1 })
      : itemName(field, item, i);
  return { listName, itemName, treeItemName, targetName };
}
