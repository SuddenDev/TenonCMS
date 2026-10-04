import { useResizeObserver } from "@vueuse/core";
import {
  computed,
  type ComputedRef,
  inject,
  type InjectionKey,
  onBeforeUnmount,
  onScopeDispose,
  provide,
  reactive,
  ref,
  type Ref,
  toRef,
  watch,
} from "vue";
import { useRouter } from "vue-router";

/** Width of a collapsed pane in px. */
export const COLLAPSED = 44;
/** Below this row width the panes stack: one shows at a time, with a back button. */
export const STACK = 640;

// `width`: the current width; a resize keeps it between `min` and `max`. A `grow` pane never resizes.
// `manual`: true when the editor collapsed the pane, false when they expanded it, null to follow the space.
// `collapsible`: false for a pane that never collapses.
type Entry = {
  el: HTMLElement | undefined;
  min: number;
  max: number;
  width: number;
  manual: boolean | null;
  collapsible: boolean;
};
type Panes = {
  entries: Set<Entry>;
  list: ComputedRef<Entry[]>;
  collapsed: ComputedRef<Set<Entry>>;
  stacked: ComputedRef<boolean>;
  /** The index of the pane shown in the stacked layout; `null` is the last one. */
  active: Ref<number | null>;
  /** The width of the row in px. */
  width: Ref<number>;
};

const key: InjectionKey<Panes> = Symbol("panes");

const byPosition = (a: Entry, b: Entry) =>
  a.el!.compareDocumentPosition(b.el!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

/**
 * Called by the layout with the row that holds the panes. When the panes do not fit, the leftmost
 * ones collapse first. The rightmost pane and panes the editor expanded stay open. One pane always
 * stays open: a collapse that would close the last open pane is kept but not applied. On a narrow
 * row the panes stack instead: only one shows, the last one until the editor goes back.
 */
export function providePanes(row: Ref<HTMLElement | undefined>) {
  const entries = reactive(new Set<Entry>()) as Set<Entry>;
  const width = ref(Infinity);
  useResizeObserver(row, ([e]) => (width.value = e!.contentRect.width));

  const list = computed(() => [...entries].filter((e) => e.el).sort(byPosition));
  const stacked = computed(() => width.value < STACK);
  const active = ref<number | null>(null);
  // A pane that opens or closes shows the last one again.
  watch(list, () => (active.value = null));
  // Also fires for a link to the current route, which changes nothing else: it opens the last pane.
  onScopeDispose(useRouter().afterEach(() => (active.value = null)));

  const collapsed = computed(() => {
    if (stacked.value) return new Set<Entry>();
    const all = list.value;
    const out = new Set(all.filter((e) => e.collapsible && e.manual));
    let total = all.reduce((sum, e) => sum + (out.has(e) ? COLLAPSED : e.width), 0);
    for (const e of all.slice(0, -1)) {
      if (total <= width.value) break;
      if (!e.collapsible || e.manual !== null) continue;
      out.add(e);
      total -= e.width - COLLAPSED;
    }
    if (out.size === all.length) out.delete(all.at(-1)!);
    return out;
  });

  provide(key, { entries, list, collapsed, stacked, active, width });
}

/**
 * Registers a pane of `width` px (default `min`), resizable between `min` and `max`. A toggle pins the
 * editor's choice for the pane's lifetime.
 */
export function usePane(
  el: Ref<HTMLElement | undefined>,
  min: number,
  max: number,
  collapsible = true,
  width = min,
) {
  const panes = inject(key)!;
  const entry = reactive({ el, min, max, width, manual: null, collapsible }) as Entry;
  panes.entries.add(entry);
  onBeforeUnmount(() => panes.entries.delete(entry));

  const index = computed(() => panes.list.value.indexOf(entry));
  const shown = computed(() => panes.active.value ?? panes.list.value.length - 1);
  const collapsed = computed(() => panes.collapsed.value.has(entry));
  const hidden = computed(() => panes.stacked.value && index.value !== shown.value);
  const toggle = () => {
    if (!panes.stacked.value && collapsible) entry.manual = !collapsed.value;
  };
  // Shows the pane to the left, in the stacked layout only.
  const back = computed(() =>
    panes.stacked.value && index.value > 0 ? () => (panes.active.value = index.value - 1) : null,
  );
  // The other panes keep at least their `min`, collapsed ones `COLLAPSED`.
  const resize = (to: number) => {
    const others = panes.list.value
      .filter((e) => e !== entry)
      .reduce((sum, e) => sum + (panes.collapsed.value.has(e) ? COLLAPSED : e.min), 0);
    entry.width = Math.max(Math.min(to, max, panes.width.value - others), min);
  };
  return {
    collapsed,
    collapsible,
    hidden,
    stacked: panes.stacked,
    toggle,
    back,
    width: toRef(entry, "width"),
    resize,
  };
}
