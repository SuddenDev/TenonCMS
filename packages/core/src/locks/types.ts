// This file MUST stay free of runtime imports. The client and the admin import it.

/** The edit lock of a document or global, as a claim answers it. */
export type Lock = {
  /** Whether the caller holds the lock. */
  mine: boolean;
  /** The holder. `name` is `''` for a user that no longer exists. */
  user: { id: string; name: string };
};
