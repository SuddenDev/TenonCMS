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
  // better-auth's fixed `baseURL`: `auth.baseURL`, else `site.url`. A dynamic one needs a request.
  const fixedOrigin = async () => {
    const { baseURL } = (await core.auth()).options;
    if (typeof baseURL === "string") return new URL(baseURL).origin;
    throw new Error(
      "tenoncms: cms.users.invite() needs `url`, or `site.url` or `auth.baseURL` in the config",
    );
  };
  return {
    async hasUsers() {
      requireTrusted();
      return !(await signUpStatus(await core.db())).setup;
    },
    async invite(input) {
      requireTrusted();
      // Server code is trusted, so a given page MAY be on any origin.
      const origin = input.url ? (URL.parse(input.url)?.origin ?? "") : await fixedOrigin();
      return createInvite(core, undefined, input, origin);
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
