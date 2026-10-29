import type { FieldContext, Mount } from "tenoncms/admin";
import { texts } from "../utils/texts.ts";

/**
 * Mount a rating field as a row of 5 stars (★).
 * Clicking a star sets the value to that number, clicking the same star again clears the value.
 * The field is read-only if `field.readOnly` is true.
 */
export const mountRatingField: Mount<FieldContext> = (el, ctx) => {
  const render = ({ value, onChange, field, tenon }: FieldContext) =>
    el.replaceChildren(
      ...[1, 2, 3, 4, 5].map((n) => {
        const star = Object.assign(document.createElement("button"), {
          type: "button",
          textContent: n <= Number(value ?? 0) ? "★" : "☆",
          disabled: field.readOnly,
          onclick: () => onChange(value === String(n) ? null : String(n)),
        });
        star.setAttribute("aria-label", texts(tenon.locale)("star", { n }));
        star.style.fontSize = "1.25rem";
        return star;
      }),
    );
  render(ctx);
  return { update: render, unmount: () => el.replaceChildren() };
};
