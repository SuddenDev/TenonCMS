import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Core } from "../../cms/runtime/types.ts";
import { createUser } from "./create-user.operation.ts";

// `Core` hides better-auth's API from the type checker, so the method is typed here.
type Api = {
  signInUser(context: {
    body: { userId: string };
    returnHeaders: true;
  }): Promise<{ headers: Headers; response: { user: object } }>;
};

/**
 * Creates a user without a request and signs them in, whichever sign-in methods are on. The first user becomes an
 * admin.
 * @param undo Runs when better-auth rejects the user, before the error is thrown. A failed sign-in does not run it:
 * the user exists then.
 * @returns The new user and the session cookies to forward.
 * @throws {HTTPException} better-auth's status for a rejected user, e.g. 400 for a short password.
 */
export async function createAndSignIn(
  core: Core,
  input: Parameters<typeof createUser>[1],
  undo?: () => Promise<unknown>,
) {
  let id: string;
  try {
    ({ id } = await createUser(core, input));
  } catch (error) {
    await undo?.();
    throw asHttp(error);
  }

  const { api } = (await core.auth()) as unknown as { api: Api };
  const { headers, response } = await api.signInUser({
    body: { userId: id },
    returnHeaders: true,
  });
  return { user: response.user, headers };
}

// better-auth's `APIError` has a status code and a message for the client.
function asHttp(error: unknown) {
  const e = error as { statusCode?: number; body?: { message?: string } };
  if (typeof e?.statusCode !== "number") return error;
  return new HTTPException(e.statusCode as ContentfulStatusCode, {
    message: e.body?.message ?? "The user was rejected",
  });
}
