/** The part of a Durable Object's `ctx.storage` that the alarm uses. */
export type AlarmStorage = {
  getAlarm(): Promise<number | null>;
  setAlarm(at: number): Promise<void>;
};

/**
 * Sets the alarm to `at` (epoch milliseconds) when none is set or the set one is later. An earlier alarm stays.
 */
export async function armAlarm(storage: AlarmStorage, at: number) {
  const current = await storage.getAlarm();
  if (current === null || at < current) await storage.setAlarm(at);
}
