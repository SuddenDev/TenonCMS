// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, nextTick, type App } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { i18n } from "@/shared/i18n";
import { CmsError } from "@/shared/api";
import { DeletionCancelled, withLinkedDeletion } from "@/shared/linked-deletion";
import LinkedDeletionDialog from "./LinkedDeletionDialog.vue";

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = "";
});

function mountDialog() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:p(.*)", component: { render: () => null } }],
  });
  app = createApp(LinkedDeletionDialog).use(i18n).use(router);
  app.mount(document.body.appendChild(document.createElement("div")));
}

const frame = () => new Promise((r) => setTimeout(r, 20));
const button = (text: RegExp) =>
  [...document.querySelectorAll("button")].find((b) => text.test(b.textContent ?? ""))!;

it("retries with allowBrokenLinks when the editor confirms", async () => {
  mountDialog();
  const action = vi.fn(async (options: { allowBrokenLinks?: boolean }) => {
    if (options.allowBrokenLinks) return "deleted";
    throw new CmsError(409, {
      code: "LINKED_CONTENT",
      references: [{ global: "navigation", field: "main.0.link" }],
    });
  });

  const result = withLinkedDeletion(action);
  await nextTick();
  await frame();
  button(/break links/i).click();

  expect(await result).toBe("deleted");
  expect(action).toHaveBeenLastCalledWith({ allowBrokenLinks: true });
});

it("cancels when the editor closes the dialog", async () => {
  mountDialog();
  const result = withLinkedDeletion(async () => {
    throw new CmsError(409, { code: "LINKED_CONTENT", references: [] });
  });

  await nextTick();
  await frame();
  button(/cancel/i).click();

  await expect(result).rejects.toBeInstanceOf(DeletionCancelled);
});
