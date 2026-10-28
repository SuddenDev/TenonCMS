import { apiKey, defaultKeyHasher } from "@better-auth/api-key";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import type { BetterAuthPlugin } from "better-auth";
import { API_KEY_HEADER } from "../../client/constants.ts";

const KEY_LENGTH = 64;
const START_LENGTH = 6;

/**
 * better-auth's `apiKey()` as core uses it. A key never becomes a session, so better-auth's own endpoints ignore it;
 * `caller()` verifies it. better-auth's per-key rate limit is off: its default allows 10 requests a day.
 */
export const apiKeys = () =>
  apiKey({
    apiKeyHeaders: API_KEY_HEADER,
    enableSessionForAPIKeys: false,
    rateLimit: { enabled: false },
    defaultKeyLength: KEY_LENGTH,
    startingCharactersConfig: { charactersLength: START_LENGTH },
  });

/**
 * A new secret as {@link apiKeys} creates one, for rolling a key. A host's own `api-key` plugin with another length,
 * prefix or hashing MUST NOT roll keys this way.
 * @returns The secret, its hash for the `key` column, and its first characters for `start`.
 */
export async function newApiKeySecret() {
  const key = generateRandomString(KEY_LENGTH, "a-z", "A-Z");
  return { key, hash: await defaultKeyHasher(key), start: key.slice(0, START_LENGTH) };
}

/**
 * Refuses better-auth's `/api-key/*` routes over HTTP, so a user cannot create a key for themselves there. Core's
 * `/api-keys` routes check the role and call better-auth without a request.
 */
export const apiKeyRoutesOff = () =>
  ({
    id: "integral-api-key-routes-off",
    hooks: {
      before: [
        {
          matcher: (ctx) => !!ctx.request && !!ctx.path?.startsWith("/api-key/"),
          handler: createAuthMiddleware(async () => {
            throw new APIError("FORBIDDEN", { message: "Use /api-keys" });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
