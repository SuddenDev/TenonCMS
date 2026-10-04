import { betterAuth, type BetterAuthOptions } from "better-auth";

export function createAuth<O extends BetterAuthOptions>(options: O) {
  return betterAuth(options);
}
