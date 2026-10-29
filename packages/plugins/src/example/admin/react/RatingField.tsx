import type { FieldContext } from "tenoncms/admin";
import { texts } from "../utils/texts.ts";

/** 5 stars. A click sets the rating, a click on the current star clears it. */
export function RatingField({ value, onChange, field, tenon }: FieldContext) {
  const t = texts(tenon.locale);
  return (
    <span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={t("star", { n })}
          disabled={field.readOnly}
          className="ex:text-xl"
          onClick={() => onChange(value === String(n) ? null : String(n))}
        >
          {n <= Number(value ?? 0) ? "★" : "☆"}
        </button>
      ))}
    </span>
  );
}
