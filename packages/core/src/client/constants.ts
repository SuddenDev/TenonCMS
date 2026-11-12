/** Path of the HTTP API. */
export const API_BASE = "/_tenon";

/** The request header that carries an API key. */
export const API_KEY_HEADER = "x-api-key";

/** Milliseconds an edit lock lasts without a renewal. The admin renews it every third of that. */
export const LOCK_TTL = 90_000;

/** The `client_id` of the `tenon` CLI in better-auth's device flow. Core accepts no other. */
export const DEVICE_CLIENT_ID = "tenon-cli";
