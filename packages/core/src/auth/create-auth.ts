import { betterAuth, type BetterAuthOptions } from "better-auth";
import { authBaseURL } from "./config/base-url.ts";

export function createAuth<O extends BetterAuthOptions>(options: O, requestOrigin?: string) {
  return betterAuth({ ...options, baseURL: authBaseURL(options.baseURL, requestOrigin) });
}
