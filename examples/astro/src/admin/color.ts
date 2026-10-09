import type { FieldContext, Mount } from "integral-cms/admin";

// Plain DOM. Any framework can mount into `el` the same way.
export const mountColor: Mount<FieldContext> = (el, { value, onChange }) => {
  const input = Object.assign(document.createElement("input"), {
    type: "color",
    value: value ?? "#000000",
  });
  input.oninput = () => onChange(input.value);
  el.append(input);
  return () => input.remove();
};
