import css from "./example-plugin.css?inline";

/** Injects the stylesheet of the example pages once. */
export function addStyles() {
  if (document.querySelector("style[data-plugin=example-page]")) return;
  const style = document.createElement("style");
  style.dataset.plugin = "example-page";
  style.textContent = css;
  document.head.append(style);
}
