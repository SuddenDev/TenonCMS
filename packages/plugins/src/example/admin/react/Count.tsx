import type { AdminBarItemContext } from "integral-cms/admin";

/** The quote count as a badge. Styled inline, because the bar's shadow root gets no page CSS. */
export function Count({ data }: AdminBarItemContext<number>) {
  return (
    <span
      style={{
        font: "500 11px/1 ui-monospace, monospace",
        padding: "3px 6px",
        borderRadius: 4,
        background: "rgb(127 127 127 / 0.15)",
      }}
    >
      {data} quotes
    </span>
  );
}
