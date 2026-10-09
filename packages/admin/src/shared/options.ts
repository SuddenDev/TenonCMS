import type { ClientRegistry } from "../../../core/src/admin/browser/lazy-mount.ts";
import type { InjectionKey, Ref, ShallowRef } from "vue";
import type { Session } from "./api";
import type {
  AdminDescriptor,
  IntegralContext,
  PageDescriptor,
} from "../../../core/src/admin/index.d.ts";
import type { ExtensionData } from "./composables/useExtensionData";

export const registryKey = Symbol() as InjectionKey<ClientRegistry>;
/** Applies the registrations of the signed-in admin: branding and the routes of the custom pages. */
export const configureKey = Symbol() as InjectionKey<(admin: AdminDescriptor) => Promise<void>>;

/** Branding. It comes from `/admin-brand` before sign-in and from the descriptor after. */
export type Branding = Pick<AdminDescriptor, "name" | "logo" | "icon" | "favicon">;
export const optionsKey = Symbol() as InjectionKey<Branding>;

/** The load of the custom page on screen, set by its route view. The page header reads the same data. */
export const pageDataKey = Symbol() as InjectionKey<ShallowRef<ExtensionData<any> | undefined>>;
export const integralKey = Symbol() as InjectionKey<IntegralContext>;
export const sessionKey = Symbol() as InjectionKey<{
  user: Ref<Session["user"] | null>;
  signOut: () => Promise<void>;
  /** The server answered 401: the session is gone. Shows the sign-in and stops everything behind it. */
  expire: () => void;
}>;

/** Path of the content views: collections, globals, media and settings. */
export const CONTENT = "/content";

/** Path of a host page. Pages shown in the content menu or on the Settings page sit under `CONTENT`. */
export function pagePath(
  key: string,
  { route = `/${key}`, nav }: Pick<PageDescriptor, "route" | "nav">,
) {
  const display = nav?.display ?? "content";
  const prefix =
    display === "content" ? CONTENT : display === "settings" ? `${CONTENT}/settings` : "";
  return `${prefix}${route}`.replace(/(.)\/$/, "$1");
}
