import type { AdminBarItemContext, Mount } from "tenoncms/admin";
import { texts } from "../utils/texts.ts";

// Its own entry like the vue and react ones, whose page entries hold CSS.

/** Renders the quote count as a badge in the admin bar. Styled inline, because the bar's shadow root gets no page CSS. */
export const mountCount: Mount<AdminBarItemContext<number>> = (el, ctx) => {
  const badge = document.createElement("span");
  badge.style.cssText =
    "font: 500 11px/1 ui-monospace, monospace; padding: 3px 6px; border-radius: 4px; background: rgb(127 127 127 / 0.15)";
  const render = ({ data, tenon }: AdminBarItemContext<number>) =>
    (badge.textContent = texts(tenon.locale)("count", { n: data }));
  render(ctx);
  el.append(badge);
  return { update: render, unmount: () => badge.remove() };
};
