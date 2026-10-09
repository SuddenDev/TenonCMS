import type { AdminBarPosition } from "../../admin/index.d.ts";

/** The fixed set of floating bar positions. */
export const ADMIN_BAR_POSITIONS: readonly AdminBarPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

/** Throws at startup for a position outside {@link ADMIN_BAR_POSITIONS}. */
export function checkAdminBarPosition(position: unknown) {
  if (position !== undefined && !ADMIN_BAR_POSITIONS.includes(position as AdminBarPosition))
    throw new Error(
      "integral-cms: admin.adminBar.position MUST be one of " + ADMIN_BAR_POSITIONS.join(", "),
    );
}
