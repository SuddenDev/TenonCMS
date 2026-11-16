import { signUpStatus } from "../auth/sign-up.ts";
import type { Core } from "../cms/runtime/types.ts";
import { ForbiddenError } from "../errors.ts";
import { createInvite } from "./operations/create-invite.operation.ts";
import { createUser } from "./operations/create-user.operation.ts";
import { listUsers } from "./operations/list-users.operation.ts";
import { deactivateUser, reactivateUser, removeUser } from "./operations/manage-user.operation.ts";
import { createSignInLink } from "./operations/sign-in-link.operation.ts";
import type { UsersApi } from "./types.ts";

/**
 * `cms.users` of an instance.
 * @param trusted Whether the instance skips access rules. Every method of an untrusted one throws `ForbiddenError`.
 */
export function usersApi(core: Core, trusted: boolean): UsersApi {
  const requireTrusted = () => {
    if (!trusted) throw new ForbiddenError(403);
  };
  // Without a request, better-auth needs an origin in development. Only `signInLink()` builds a URL, from its own
  // origin.
  const requireServerCall = (origin = "http://localhost") => {
    requireTrusted();
    core.bindOrigin(origin);
  };
  return {
    async hasUsers() {
      requireTrusted();
      return !(await signUpStatus(await core.db())).setup;
    },
    async invite(input) {
      requireTrusted();
      // Server code is trusted, so the page MAY be on any origin.
      return createInvite(core, undefined, input, URL.parse(input.url)?.origin ?? "");
    },
    async create(input) {
      requireServerCall();
      return createUser(core, input);
    },
    async signInLink(email, { origin }) {
      requireServerCall(origin);
      return createSignInLink(core, email, origin);
    },
    async list() {
      requireServerCall();
      return listUsers(core);
    },
    roles() {
      requireTrusted();
      return core.roles;
    },
    async deactivate(email) {
      requireServerCall();
      return deactivateUser(core, email);
    },
    async reactivate(email) {
      requireServerCall();
      return reactivateUser(core, email);
    },
    async remove(email) {
      requireServerCall();
      return removeUser(core, email);
    },
  };
}
