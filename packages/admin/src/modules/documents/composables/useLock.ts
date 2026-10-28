import { onScopeDispose, ref, watch } from "vue";
import { LOCK_TTL, type Lock } from "@/shared/api";

/**
 * Holds the edit lock of a document or global while `active()` is true: claims it at once, renews it every third of
 * `LOCK_TTL`, and frees it when `active()` turns false or the scope ends. A lock someone else holds is claimed again on
 * each renewal, so it comes back once they leave; `onRegain` then reloads the data they changed.
 * Failed claims are ignored: the next renewal retries.
 * @returns `holder`: the other user who holds the lock, `null` while it is the caller's. `lost`: someone took it
 * over. `takeOver()`: claims it from the holder.
 */
export function useLock(options: {
  claim: (takeover: boolean) => Promise<Lock>;
  release: () => Promise<unknown>;
  active: () => boolean;
  onRegain: () => unknown;
}) {
  const holder = ref<Lock["user"] | null>(null);
  const lost = ref(false);
  let held = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  async function renew(takeover = false) {
    const lock = await options.claim(takeover).catch(() => undefined);
    if (!lock) return;

    if (lock.mine) {
      const regained = holder.value !== null;
      held = true;
      holder.value = null;
      lost.value = false;
      if (regained) options.onRegain();
    } else {
      lost.value ||= held;
      held = false;
      holder.value = lock.user;
    }
  }

  function stop() {
    clearInterval(timer);
    timer = undefined;
    if (held) options.release().catch(() => {});
    held = false;
    holder.value = null;
    lost.value = false;
  }

  watch(
    options.active,
    (on) => {
      stop();
      if (!on) return;
      renew();
      timer = setInterval(renew, LOCK_TTL / 3);
    },
    { immediate: true },
  );
  onScopeDispose(stop);

  return { holder, lost, takeOver: () => renew(true) };
}
