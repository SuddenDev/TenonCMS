import type { AdminBarItemContext, Mount } from "integral-cms/admin";

type HelloData = { editor: string; posts: number };

// A click handler gets the latest context, with the data of the item's `load`.
export const sayHello = ({ data }: AdminBarItemContext<HelloData>) =>
  alert(`Hello ${data.editor}, the site has ${data.posts} post(s)`);

export const addToCart = () => alert("Added to the cart");

export const goToCheckout = () => alert("Going to the checkout");

// The bar's shadow root does not get the page's CSS, so the element is styled inline.
// `update` gets the new context, e.g. after a perspective change.
export const mountPerspectiveBadge: Mount<AdminBarItemContext> = (el, ctx) => {
  const badge = document.createElement("span");
  badge.style.cssText =
    "font: 500 11px/1 ui-monospace, monospace; padding: 3px 6px; border-radius: 4px; background: rgb(127 127 127 / 0.15)";
  const render = (perspective: string) => (badge.textContent = `viewing ${perspective}`);
  render(ctx.perspective);
  el.append(badge);
  return {
    update: (next) => render(next.perspective),
    unmount: () => badge.remove(),
  };
};
