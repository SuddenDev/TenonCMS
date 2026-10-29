import type { AdminBarItemContext, Mount } from "tenoncms/admin";
import { renderReact } from "tenoncms/admin/react";
import { Count } from "./Count.tsx";

// Its own entry, because the bar's module graph MUST NOT contain CSS and the page entry has some.

/** Mounts {@link Count}: the quote count as a badge in the admin bar. */
export const mountCount: Mount<AdminBarItemContext<number>> = renderReact(Count);
