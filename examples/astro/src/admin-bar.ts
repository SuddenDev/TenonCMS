import { addAdminBarItem } from "integral-cms/preview";

// A button in the bar's own style.
addAdminBarItem({
  id: "hello",
  label: "Say hello",
  onClick: () => alert("Hello from the admin bar"),
});

// A custom element with plain DOM. It sits in the bar's shadow root, where the page's CSS does not reach, so it is
// styled inline. `update` gets the new context, e.g. after a perspective change.
addAdminBarItem({
  id: "perspective-badge",
  label: "Perspective",
  mount: (el, ctx) => {
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
  },
});
