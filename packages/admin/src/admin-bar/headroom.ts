/** Where the page was when the bar last changed, and whether the bar is hidden. */
export type HeadroomState = { y: number; hidden: boolean };

/**
 * Decides whether a bar hides on scroll. It is always shown within `height` of the top and while
 * `pinned`. A scroll down by more than `threshold` (default 8 px) hides it, a scroll up by more
 * shows it. Smaller moves return `state` itself and keep its `y`, so slow scrolling adds up.
 */
export function headroom(
  state: HeadroomState,
  y: number,
  options: { height: number; threshold?: number; pinned?: boolean },
): HeadroomState {
  if (y <= options.height || options.pinned) return { y, hidden: false };
  const delta = y - state.y;
  if (Math.abs(delta) <= (options.threshold ?? 8)) return state;
  return { y, hidden: delta > 0 };
}
