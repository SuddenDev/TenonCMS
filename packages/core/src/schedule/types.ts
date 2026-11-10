// This file MUST stay free of runtime imports. The client and the admin import it.

export const SCHEDULE_ACTIONS = ["publish", "unpublish"] as const;
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

/** Options of `schedule()` and `scheduleGlobal()`. */
export type ScheduleOptions = {
  /** What happens at `at`. */
  action: ScheduleAction;
  /** When it happens. A time in the past is due at once. */
  at: Date | string | number;
  /** The locale to act on. Default: the default locale. Entries that are not `localized` ignore it. */
  locale?: string;
};

/** The payload of a scheduled job. */
export type ScheduledPayload = {
  kind: "collection" | "global";
  name: string;
  /** The document id. Missing for a global. */
  id?: string;
  /** `null` for an entry that is not localized. */
  locale: string | null;
};
