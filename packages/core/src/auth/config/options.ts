import type { BetterAuthOptions } from "better-auth";

type Model = "user" | "session" | "account" | "verification";

// Core reads the `user` table by name, so models MUST keep their default names.
// `never` also rejects `modelName` next to valid keys; generic inference skips excess property checks.
export type AuthOptions = Omit<BetterAuthOptions, "database" | "basePath" | "secret" | Model> & {
  [K in Model]?: Omit<NonNullable<BetterAuthOptions[K]>, "modelName"> & { modelName?: never };
};
