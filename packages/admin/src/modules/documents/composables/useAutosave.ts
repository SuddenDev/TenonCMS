import { onScopeDispose, ref } from "vue";

/**
 * Saves `delay` ms after the last change, or at once with `flush()`.
 * One save runs at a time. Changes during a save queue exactly one more, which reads the data as it is then.
 * A failed save keeps the change pending, so the next change or `flush()` retries it.
 */
export function useAutosave(save: () => Promise<void>, delay = 800) {
  const saving = ref(false);
  const savedAt = ref<Date | null>(null);
  const error = ref<unknown>(null);
  const pending = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;

  function schedule() {
    pending.value = true;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  /** Saves pending changes now. Resolves once none are left or a save failed. */
  function flush(): Promise<void> {
    clearTimeout(timer);
    if (pending.value) running ??= run().finally(() => (running = undefined));
    return running ?? Promise.resolve();
  }

  async function run() {
    saving.value = true;
    try {
      while (pending.value) {
        pending.value = false;
        await save();
        savedAt.value = new Date();
      }
      error.value = null;
    } catch (e) {
      pending.value = true;
      error.value = e;
    } finally {
      saving.value = false;
    }
  }

  // Leaving the form saves what is still pending.
  onScopeDispose(() => {
    if (pending.value) flush();
    else clearTimeout(timer);
  });

  return { schedule, flush, pending, saving, savedAt, error };
}
