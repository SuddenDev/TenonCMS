import { reactive, shallowRef } from "vue";
import { toast } from "vue-sonner";
import type { Text } from "../../../../core/src/admin/index.d.ts";
import { client } from "@/shared/api";
import { i18n, text } from "@/shared/i18n";

const { t } = i18n.global;

// Shared, so the top bar and the menu agree on which action runs.
const running = reactive(new Set<string>());

/** The question of the action that waits for a yes, for `ActionConfirmDialog`. */
export const pendingConfirm = shallowRef<{
  label: string;
  question: string;
  answer(yes: boolean): void;
}>();

const ask = (label: string, question: string) =>
  new Promise<boolean>((resolve) => {
    pendingConfirm.value = {
      label,
      question,
      answer(yes) {
        pendingConfirm.value = undefined;
        resolve(yes);
      },
    };
  });

/**
 * Runs admin actions: asks `confirm` first when the action has one, then `POST /admin/actions/:key`, then a toast with
 * the returned text, or the error message. A second click on a running action does nothing.
 */
export function useAction() {
  async function run(key: string, label: string, confirm?: string) {
    if (running.has(key)) return;
    if (confirm && !(await ask(label, confirm))) return;
    running.add(key);
    try {
      const { message } = await client.request<{ message: Text | null }>(
        `/admin/actions/${encodeURIComponent(key)}`,
        { method: "POST" },
      );
      toast.success(text(message ?? undefined) ?? t("actions.done", { label }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("actions.failed", { label }));
    } finally {
      running.delete(key);
    }
  }
  return { run, isRunning: (key: string) => running.has(key) };
}
