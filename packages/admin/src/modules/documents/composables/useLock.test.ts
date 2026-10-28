import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { LOCK_TTL } from "@/shared/api";
import { useLock } from "./useLock";

const me = { mine: true, user: { id: "me", name: "Me" } };
const ann = { mine: false, user: { id: "ann", name: "Ann" } };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function start(answers: (typeof me)[], active = ref(true)) {
  const claim = vi.fn(async () => answers.shift() ?? me);
  const release = vi.fn(async () => {});
  const onRegain = vi.fn();
  const scope = effectScope();
  const lock = scope.run(() => useLock({ claim, release, active: () => active.value, onRegain }))!;
  return { lock, claim, release, onRegain, scope, active };
}

describe("useLock", () => {
  it("claims at once, renews on a timer and releases on stop", async () => {
    const { claim, release, scope } = start([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(claim).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(LOCK_TTL / 3);
    expect(claim).toHaveBeenCalledTimes(2);

    scope.stop();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("names the holder, and reloads when the lock comes back", async () => {
    const { lock, onRegain } = start([ann]);
    await vi.advanceTimersByTimeAsync(0);
    expect(lock.holder.value).toEqual(ann.user);
    expect(lock.lost.value).toBe(false);

    await vi.advanceTimersByTimeAsync(LOCK_TTL / 3);
    expect(lock.holder.value).toBeNull();
    expect(onRegain).toHaveBeenCalledTimes(1);
  });

  it("reports a takeover and takes the lock back on request", async () => {
    const { lock, claim, release, scope } = start([me, ann]);
    await vi.advanceTimersByTimeAsync(LOCK_TTL / 3);
    expect(lock.lost.value).toBe(true);
    expect(lock.holder.value).toEqual(ann.user);

    await lock.takeOver();
    expect(claim).toHaveBeenLastCalledWith(true);
    expect(lock.lost.value).toBe(false);

    scope.stop();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does nothing while inactive, and releases when it turns inactive", async () => {
    const { claim, release, active } = start([], ref(false));
    await vi.advanceTimersByTimeAsync(LOCK_TTL);
    expect(claim).not.toHaveBeenCalled();

    active.value = true;
    await nextTick();
    await vi.advanceTimersByTimeAsync(0);
    expect(claim).toHaveBeenCalledTimes(1);

    active.value = false;
    await nextTick();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
