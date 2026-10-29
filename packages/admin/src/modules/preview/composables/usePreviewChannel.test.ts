// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "vue";
import { schema } from "@/shared/api";
import { excluded, registerPreviewTab, usePreviewChannel } from "./usePreviewChannel";

let cleanup = () => {};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  schema.value = {};
});

it("trusts only the preview iframe and registered tabs, with validated message shapes", () => {
  const frame = document.createElement("iframe");
  frame.name = "tenon-preview";
  document.body.append(frame);
  const receive = vi.fn();
  const root = document.createElement("div");
  document.body.append(root);
  let post: ReturnType<typeof usePreviewChannel>;
  const app = createApp({
    setup() {
      post = usePreviewChannel(receive);
      return () => null;
    },
  });
  app.mount(root);
  cleanup = () => app.unmount();
  const source = frame.contentWindow!;
  const postMessage = vi.spyOn(source, "postMessage").mockImplementation(() => {});
  const dispatch = (data: unknown, sender: Window = source, origin = location.origin) =>
    window.dispatchEvent(new MessageEvent("message", { data, source: sender, origin }));
  dispatch({ type: "ready" }, window);
  dispatch({ type: "documents", documents: [{}] });
  dispatch({ type: "mode", edit: true }, source, "https://evil.test");
  expect(receive).not.toHaveBeenCalled();
  dispatch({ type: "ready" });
  dispatch({ type: "documents", documents: [{ collection: "posts", id: "1" }] });
  expect(receive).toHaveBeenCalledTimes(2);
  const exclude = { collections: [], globals: [] };
  post!({ type: "mode", edit: true, exclude });
  expect(postMessage).toHaveBeenCalledWith(
    { type: "mode", edit: true, exclude },
    { targetOrigin: location.origin },
  );
  const tab = { postMessage: vi.fn(), closed: false } as unknown as Window;
  registerPreviewTab(tab);
  dispatch({ type: "ready" }, tab);
  expect(receive).toHaveBeenCalledTimes(3);
  post!({ type: "mode", edit: false, exclude });
  expect(tab.postMessage).toHaveBeenCalledWith(
    { type: "mode", edit: false, exclude },
    { targetOrigin: location.origin },
  );
  cleanup();
  dispatch({ type: "mode", edit: false });
  expect(receive).toHaveBeenCalledTimes(3);
});

it("lists the collections and globals with `visualEditing: false` for the `mode` message", () => {
  schema.value = {
    collections: { posts: { fields: {} }, comments: { visualEditing: false, fields: {} } },
    globals: { footer: { visualEditing: false, fields: {} }, general: { fields: {} } },
  };
  expect(excluded()).toEqual({ collections: ["comments"], globals: ["footer"] });
});
