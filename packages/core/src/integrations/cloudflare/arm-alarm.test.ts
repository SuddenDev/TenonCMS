import { describe, expect, it } from "vitest";
import { armAlarm } from "./arm-alarm.ts";

const storage = (alarm: number | null) => {
  const state = { alarm };
  return {
    state,
    getAlarm: async () => state.alarm,
    setAlarm: async (at: number) => void (state.alarm = at),
  };
};

describe("armAlarm", () => {
  it("sets an alarm when none is set", async () => {
    const s = storage(null);
    await armAlarm(s, 100);
    expect(s.state.alarm).toBe(100);
  });

  it("moves a later alarm forward", async () => {
    const s = storage(500);
    await armAlarm(s, 100);
    expect(s.state.alarm).toBe(100);
  });

  it("keeps an earlier alarm", async () => {
    const s = storage(50);
    await armAlarm(s, 100);
    expect(s.state.alarm).toBe(50);
  });
});
