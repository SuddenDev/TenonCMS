import { HTTPException } from "hono/http-exception";
import type { Core } from "../../cms/runtime/types.ts";
import { signInMethods } from "../../auth/config/sign-in-methods.ts";
import { signUpStatus } from "../../auth/sign-up.ts";
import { notFound } from "../../http/errors.ts";
import { createAndSignIn } from "./create-and-sign-in.operation.ts";

// The check and the create MUST NOT interleave, or two requests both find no user and both create an admin.
// ponytail: an in-process queue. Separate server instances can still race; setup runs once, by the site's owner.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Creates the first admin without a password and signs them in. While password sign-in is on, sign-up does this.
 * Calls run one at a time, so a second one finds the first admin.
 * @returns The new user and the session cookies to forward.
 * @throws {HTTPException} 404 while password sign-in is on, 409 once a user exists.
 */
export function setUpFirstAdmin(core: Core, input: { name: string; email: string }) {
  const run = queue.then(() => setUp(core, input));
  queue = run.catch(() => {});
  return run;
}

async function setUp(core: Core, input: { name: string; email: string }) {
  if (signInMethods((await core.auth()).options).password) throw notFound();
  if (!(await signUpStatus(await core.db())).setup)
    throw new HTTPException(409, { message: "An admin exists" });
  return createAndSignIn(core, input);
}
