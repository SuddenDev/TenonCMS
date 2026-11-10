const encoder = new TextEncoder();

/** The HMAC key of a secret: the decoded part of `whsec_<base64>`, else the UTF-8 bytes. Throws for bad base64. */
export function secretKey(secret: string): Uint8Array<ArrayBuffer> {
  if (!secret.startsWith("whsec_")) return encoder.encode(secret);
  return Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0));
}

const importKey = (secret: string, use: KeyUsage) =>
  crypto.subtle.importKey("raw", secretKey(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    use,
  ]);

const signedContent = (id: string, timestamp: string, body: string) =>
  encoder.encode(`${id}.${timestamp}.${body}`);

/**
 * The Standard Webhooks headers of one request: `webhook-id`, `webhook-timestamp` and, with secrets, one
 * `v1,<base64>` signature per secret in `webhook-signature`.
 */
export async function signatureHeaders(
  secrets: readonly string[],
  id: string,
  body: string,
): Promise<Record<string, string>> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "webhook-id": id, "webhook-timestamp": timestamp };
  if (!secrets.length) return headers;

  const content = signedContent(id, timestamp, body);
  const signatures = await Promise.all(
    secrets.map(async (secret) => {
      const mac = await crypto.subtle.sign("HMAC", await importKey(secret, "sign"), content);
      return `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;
    }),
  );
  headers["webhook-signature"] = signatures.join(" ");
  return headers;
}

/**
 * Checks a request that a Tenon webhook sent: one `v1` signature MUST match `secret` (or one of a list), and the
 * timestamp MUST lie within `tolerance` seconds of now. Reads a clone, so the body stays readable.
 */
export async function verifyWebhook(
  request: Request,
  secret: string | readonly string[],
  { tolerance = 300 }: { tolerance?: number } = {},
): Promise<boolean> {
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const header = request.headers.get("webhook-signature");
  if (!id || !timestamp || !header) return false;
  // Negated, so a timestamp that is not a number fails too.
  if (!(Math.abs(Date.now() / 1000 - Number(timestamp)) <= tolerance)) return false;

  const content = signedContent(id, timestamp, await request.clone().text());
  const signatures = header
    .split(" ")
    .filter((s) => s.startsWith("v1,"))
    .map((s) => s.slice(3));
  for (const key of typeof secret === "string" ? [secret] : secret) {
    const hmac = await importKey(key, "verify");
    for (const signature of signatures) {
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
      } catch {
        continue;
      }
      // `subtle.verify` compares in constant time.
      if (await crypto.subtle.verify("HMAC", hmac, bytes, content)) return true;
    }
  }
  return false;
}
