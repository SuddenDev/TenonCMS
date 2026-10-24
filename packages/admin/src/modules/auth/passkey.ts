import { client } from "@/shared/api";

const base = "/auth/passkey";

export type Passkey = { id: string; name?: string | null; createdAt: string };

/** The browser runs WebAuthn from the server's JSON options, without a helper library. */
export const passkeysSupported = () =>
  typeof PublicKeyCredential !== "undefined" &&
  "parseRequestOptionsFromJSON" in PublicKeyCredential;

/** The user closed the browser's passkey dialog, or the request was aborted. */
export const cancelled = (e: unknown) =>
  e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError");

/**
 * Signs in with a passkey and sets the session cookie.
 * @param conditional Offers the passkeys in the autofill of an `autocomplete="username webauthn"` field.
 */
export async function signInWithPasskey({
  conditional = false,
  signal,
}: { conditional?: boolean; signal?: AbortSignal } = {}) {
  const options = await client.request<PublicKeyCredentialRequestOptionsJSON>(
    `${base}/generate-authenticate-options`,
  );
  const credential = (await navigator.credentials.get({
    publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options),
    mediation: conditional ? "conditional" : undefined,
    signal,
  })) as PublicKeyCredential;
  await client.request(`${base}/verify-authentication`, {
    method: "POST",
    body: { response: credential.toJSON() },
  });
}

/** Registers a passkey for the signed-in user. better-auth requires a recent sign-in. */
export async function addPasskey(name?: string) {
  const options = await client.request<PublicKeyCredentialCreationOptionsJSON>(
    `${base}/generate-register-options`,
    { query: { name } },
  );
  const credential = (await navigator.credentials.create({
    publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options),
  })) as PublicKeyCredential;
  await client.request(`${base}/verify-registration`, {
    method: "POST",
    body: { response: credential.toJSON(), name },
  });
}

export const listPasskeys = () => client.request<Passkey[]>(`${base}/list-user-passkeys`);

export const removePasskey = (id: string) =>
  client.request(`${base}/delete-passkey`, { method: "POST", body: { id } });
