// This file MUST stay free of runtime imports. The client and the admin import it.

/** One entry of a document's or global's history, without its data. */
export type Version = {
  id: string;
  /** `draft` versions are autosaves. A user's draft saves merge into one until someone else saves or it is published. */
  status: "draft" | "published";
  /** `null` when the entry is not localized. */
  locale: string | null;
  /** `null` for server code. `name` is `''` for a user that no longer exists. */
  user: { id: string; name: string } | null;
  createdAt: string;
  /** When the version was last changed. Later than `createdAt` for merged draft saves. */
  updatedAt: string;
};

/** A version with the data it recorded. */
export type VersionWithData = Version & { data: Record<string, unknown> };
