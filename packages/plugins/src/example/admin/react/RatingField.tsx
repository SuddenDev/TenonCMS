import type { FieldContext } from "integral-cms/admin";

/** 5 stars. A click sets the rating, a click on the current star clears it. */
export function RatingField({ value, onChange, field }: FieldContext) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} of 5`}
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
