import type { AdminBarItemContext } from "tenoncms/admin";
import { texts } from "../utils/texts.ts";

/** The quote count as a badge. Styled inline, because the bar's shadow root gets no page CSS. */
export function Count({ data, tenon }: AdminBarItemContext<number>) {
  return (
    <span
      style={{
        font: "500 11px/1 ui-monospace, monospace",
        padding: "3px 6px",
        borderRadius: 4,
        background: "rgb(127 127 127 / 0.15)",
      }}
    >
      {texts(tenon.locale)("count", { n: data })}
    </span>
  );
}
