import { consola } from "consola";
import { API_BASE } from "../../client/constants.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { SignInLinkResult } from "../types.ts";

type Api = {
  createSignInLink(context: {
    body: { email: string };
  }): Promise<{ token: string; user: { name: string; email: string } }>;
};

/**
 * Creates a link that signs the user of `email` in once, within an hour, and ends their other sessions. Emails it when
 * email is configured. A failed send keeps the link; the result then has `message`.
 * @param origin The site's origin. The link points to its `/_tenon/auth/sign-in-link`.
 * @throws better-auth's 404 when no user has the email.
 */
export async function createSignInLink(
  core: Core,
  email: string,
  origin: string,
): Promise<SignInLinkResult> {
  const { api } = (await core.auth()) as unknown as { api: Api };
  const { token, user } = await api.createSignInLink({ body: { email: email.toLowerCase() } });
  const url = new URL(`${API_BASE}/auth/sign-in-link`, origin);
  url.searchParams.set("token", token);
  const link = url.href;

  if (!core.emailTemplates) return { link, sent: false };
  try {
    const content = await core.emailTemplates.signInLink({ user, url: link });
    await core.email.send({ ...content, to: user.email });
    return { link, sent: true };
  } catch (error) {
    consola.withTag("tenon").error("Sending a sign-in link failed", error);
    return { link, sent: false, message: "Sending the sign-in link failed" };
  }
}
